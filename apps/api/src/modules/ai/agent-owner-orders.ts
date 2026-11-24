import { prisma } from '../../lib/prisma'
import { callLLM } from './ai.service'

export const OWNER_ORDER_SOURCE = 'ordem_dono'

/**
 * Transforma uma ordem solta do dono ("quando perguntarem horário, já ofereça quinta e sexta")
 * numa regra curta e imperativa, usando o que foi dito no chat de teste como contexto
 * ("isso", "essa resposta"...). Devolve null se a mensagem não for uma instrução.
 */
export async function ruleFromOrder(instruction: string, history: { role: string; content: string }[] = []): Promise<string | null> {
  const context = history.slice(-8).map((m) => `${m.role === 'user' ? 'CLIENTE (teste)' : 'AGENTE'}: ${m.content}`).join('\n')
  const res = await callLLM({
    model: 'claude-haiku-4-5',
    system:
      'Você transforma uma ordem do DONO do negócio para o agente de atendimento numa regra permanente. ' +
      'Responda APENAS com a regra: uma ou duas frases curtas, no imperativo, em português, autoexplicativas (sem depender da conversa). ' +
      'Use o contexto da conversa de teste só para entender referências como "isso", "essa resposta", "nesse caso". ' +
      'Preserve literalmente textos que o dono mandou dizer, números, preços e prazos. Não invente nada que o dono não disse. ' +
      'Se a mensagem for apenas uma pergunta ou conversa, e não uma instrução de como o agente deve agir, responda exatamente: NADA',
    messages: [{ role: 'user', content: `Conversa de teste (contexto):\n${context || '(vazia)'}\n\nORDEM DO DONO:\n${instruction}` }],
    maxTokens: 300,
  })
  const rule = res.content.trim()
  if (!rule || rule.toUpperCase().startsWith('NADA')) return null
  return rule.slice(0, 600)
}

export async function saveOwnerOrder(opts: { workspaceId: string; agentId: string; content: string }) {
  return prisma.agentLearning.create({
    data: { workspaceId: opts.workspaceId, agentId: opts.agentId, content: opts.content, sourceType: OWNER_ORDER_SOURCE },
  })
}
