import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../../lib/prisma'
import { getWorkspaceId } from '../../lib/workspace'
import { AGENT_TOOLS, processAgentWithTools } from './agent-tools'
import { buildSystemPrompt, retrieveContext } from './ai.service'
import { logger } from '../../lib/logger'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function agentToolsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate)

  // Listar tools disponíveis no sistema
  app.get('/agents/tools/available', async (_req, reply) => {
    return reply.send(
      AGENT_TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.input_schema,
      }))
    )
  })

  // Buscar tools habilitadas para um agente específico
  app.get<{ Params: { id: string } }>('/agents/:id/tools', async (req, reply) => {
    const { sub, wid } = req.user as { sub: string; wid?: string }
    const workspaceId = await getWorkspaceId(sub, wid)
    const { id } = req.params as { id: string }

    const agent = await prisma.agent.findFirst({ where: { id, workspaceId }, include: { config: true } })
    if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })

    const enabledTools: string[] = (agent.config as any)?.enabledTools ?? []
    return reply.send({ enabledTools })
  })

  // Atualizar tools habilitadas para um agente
  app.put<{ Params: { id: string }; Body: { enabledTools: string[] } }>(
    '/agents/:id/tools',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)
      const { id } = req.params as { id: string }
      const { enabledTools } = z.object({
        enabledTools: z.array(z.string()),
      }).parse(req.body)

      const agent = await prisma.agent.findFirst({ where: { id, workspaceId } })
      if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })

      // Valida que as tools existem
      const validTools = AGENT_TOOLS.map(t => t.name)
      const invalid = enabledTools.filter(t => !validTools.includes(t))
      if (invalid.length > 0) return reply.status(400).send({ error: `Tools inválidas: ${invalid.join(', ')}` })

      await prisma.agentConfig.update({
        where: { agentId: id },
        data: { webhookEvents: { enabledTools } as any },
      })

      return reply.send({ ok: true, enabledTools })
    }
  )

  // ─── Builder de Agente por Linguagem Natural ──────────────────────────────────

  app.post<{ Body: { descricao: string } }>(
    '/agents/builder/natural-language',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      await getWorkspaceId(sub, wid) // valida auth

      const { descricao } = z.object({
        descricao: z.string().min(10).max(2000),
      }).parse(req.body)

      const toolDescriptions = AGENT_TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n')

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1500,
        system: `Você é um assistente que configura agentes de IA para negócios brasileiros. O usuário descreve em linguagem natural o que quer que o agente faça, e você retorna uma configuração JSON.

Tools disponíveis:
${toolDescriptions}

Responda APENAS com um JSON válido no seguinte formato:
{
  "name": "Nome sugerido para o agente",
  "behavior": "System prompt completo em português para o agente, descrevendo seu papel, o que pode e não pode fazer",
  "communicationStyle": "FORMAL | NORMAL | CASUAL",
  "enabledTools": ["lista", "de", "tools", "necessárias"],
  "suggestedTemplates": ["descrição de automação 1", "descrição de automação 2"],
  "refinementQuestions": ["Pergunta para refinar a configuração 1", "Pergunta 2"]
}`,
        messages: [{ role: 'user', content: `Configure um agente para o seguinte cenário:\n\n${descricao}` }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : '{}'

      try {
        const config = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim())
        return reply.send({ ok: true, config })
      } catch {
        logger.error('Builder NL parse error', { text })
        return reply.status(500).send({ error: 'Erro ao processar a descrição. Tente ser mais específico.' })
      }
    }
  )

  // Aplicar configuração gerada pelo builder ao agente
  app.post<{
    Params: { id: string }
    Body: {
      name?: string
      behavior?: string
      communicationStyle?: string
      enabledTools?: string[]
    }
  }>(
    '/agents/:id/apply-builder-config',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)
      const { id } = req.params as { id: string }

      const agent = await prisma.agent.findFirst({ where: { id, workspaceId } })
      if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })

      const { name, behavior, communicationStyle, enabledTools } = req.body

      await prisma.agent.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(behavior ? { behavior } : {}),
          ...(communicationStyle ? { communicationStyle: communicationStyle as any } : {}),
        },
      })

      if (enabledTools) {
        await prisma.agentConfig.update({
          where: { agentId: id },
          data: { webhookEvents: { enabledTools } as any },
        })
      }

      return reply.send({ ok: true })
    }
  )

  // ─── Testar agente com tools (chat simulado) ──────────────────────────────────

  app.post<{
    Params: { id: string }
    Body: { message: string; history?: { role: string; content: string }[] }
  }>(
    '/agents/:id/test-with-tools',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)
      const { id } = req.params as { id: string }
      const { message, history = [] } = req.body

      const agent = await prisma.agent.findFirst({
        where: { id, workspaceId },
        include: { config: true },
      })
      if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })

      const start = Date.now()
      const knowledgeContext = await retrieveContext(message, id)
      const systemPrompt = buildSystemPrompt(agent as any, agent.config, knowledgeContext)

      const enabledTools: string[] = (agent.config?.webhookEvents as any)?.enabledTools ?? []

      const conversationHistory = history.map(m => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      }))

      const result = await processAgentWithTools({
        agent,
        systemPrompt,
        conversationHistory,
        userMessage: message,
        ctx: { workspaceId, agentId: id },
        enabledTools: enabledTools.length > 0 ? enabledTools : undefined,
      })

      return reply.send({
        response: result.content,
        creditsUsed: result.creditsUsed,
        toolsUsed: result.toolsUsed,
        model: agent.llmModel,
        responseTimeMs: Date.now() - start,
      })
    }
  )

  // ─── Métricas de uso de tools ─────────────────────────────────────────────────

  app.get<{ Params: { id: string }; Querystring: { days?: string } }>(
    '/agents/:id/tools/metrics',
    async (req, reply) => {
      const { sub, wid } = req.user as { sub: string; wid?: string }
      const workspaceId = await getWorkspaceId(sub, wid)
      const { id } = req.params as { id: string }
      const days = Number(req.query.days ?? 7)

      const agent = await prisma.agent.findFirst({ where: { id, workspaceId } })
      if (!agent) return reply.status(404).send({ error: 'Agente não encontrado' })

      const since = new Date(Date.now() - days * 86400000)

      // Busca mensagens com metadata de tools usadas
      const messages = await prisma.message.findMany({
        where: {
          conversation: { agentId: id, workspaceId },
          createdAt: { gte: since },
          metadata: { not: null },
        } as any,
        select: { metadata: true, createdAt: true },
      })

      const toolCounts: Record<string, number> = {}
      for (const msg of messages) {
        const meta = msg.metadata as any
        if (meta?.toolsUsed) {
          for (const tool of meta.toolsUsed) {
            toolCounts[tool] = (toolCounts[tool] ?? 0) + 1
          }
        }
      }

      return reply.send({ period: `${days} dias`, toolUsage: toolCounts, totalMessages: messages.length })
    }
  )
}
