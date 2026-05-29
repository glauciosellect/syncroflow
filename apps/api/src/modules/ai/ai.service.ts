import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { prisma } from '../../lib/prisma'
import type { Agent, AgentConfig, Intention } from '@prisma/client'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8191),
  })
  return res.data[0].embedding
}

export async function callLLM(opts: {
  model: string
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  maxTokens?: number
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const { model, system, messages, maxTokens = 1024 } = opts

  if (model.startsWith('claude')) {
    const res = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages,
    })
    const content = res.content[0].type === 'text' ? res.content[0].text : ''
    return { content, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }
  }

  if (model.startsWith('gpt')) {
    const res = await openai.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
    })
    const content = res.choices[0].message.content || ''
    const inputTokens = res.usage?.prompt_tokens || 0
    const outputTokens = res.usage?.completion_tokens || 0
    return { content, inputTokens, outputTokens }
  }

  throw new Error(`Modelo não suportado: ${model}`)
}

export function calcCredits(inputTokens: number, outputTokens: number, model: string): number {
  const total = inputTokens + outputTokens
  const rates: Record<string, number> = {
    'claude-haiku-4-5': 1,
    'claude-3-5-sonnet-20241022': 3,
    'claude-opus-4-5': 10,
    'gpt-4o-mini': 1,
    'gpt-4o': 5,
  }
  const rate = rates[model] || 1
  return Math.ceil((total / 750) * rate)
}

export function buildSystemPrompt(agent: Agent, config: AgentConfig | null, knowledgeContext: string): string {
  const style = config?.communicationStyle || agent.communicationStyle
  return `
Você é ${agent.name}, um assistente de ${agent.purpose === 'SUPPORT' ? 'suporte' : agent.purpose === 'SALES' ? 'vendas' : 'uso pessoal'} ${agent.companyName ? `da empresa ${agent.companyName}` : ''}.

${agent.companyDesc ? `Sobre a empresa: ${agent.companyDesc}` : ''}
${agent.companyWebsite ? `Site oficial: ${agent.companyWebsite}` : ''}

Estilo de comunicação: ${style === 'FORMAL' ? 'formal e profissional' : style === 'CASUAL' ? 'descontraído e amigável' : 'normal'}
${config?.useEmojis ? 'Você pode usar emojis nas respostas.' : 'Não use emojis.'}
${config?.signNameInResponses ? `Assine suas respostas com "${agent.name}".` : ''}
${config?.restrictTopics ? 'Responda apenas sobre assuntos relacionados à empresa e seus serviços. Recuse gentilmente perguntas fora do escopo.' : ''}
${config?.splitLongMessages ? 'Para respostas longas, divida em partes menores e claras.' : ''}

${agent.behavior || ''}

${knowledgeContext ? `CONHECIMENTO RELEVANTE:\n${knowledgeContext}` : ''}

Regras importantes:
- Se não souber algo, diga que vai verificar e não invente informações
${config?.transferToHuman ? '- Se o cliente pedir explicitamente para falar com humano, responda que irá transferi-lo' : ''}
- Data e hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: config?.timezone || 'America/Sao_Paulo' })}
`.trim()
}

export async function retrieveContext(message: string, agentId: string, topK = 5): Promise<string> {
  try {
    const embedding = await generateEmbedding(message)
    const vectorStr = `[${embedding.join(',')}]`

    const chunks = await prisma.$queryRawUnsafe<{ content: string; similarity: number }[]>(`
      SELECT content, 1 - (embedding <=> '${vectorStr}'::vector) as similarity
      FROM (
        SELECT tc.content, tc.embedding FROM "TrainingChunk" tc
        INNER JOIN "Training" t ON t.id = tc."trainingId"
        WHERE t."agentId" = '${agentId}' AND t.status = 'DONE'
        UNION ALL
        SELECT kc.content, kc.embedding FROM "KnowledgeChunk" kc
        INNER JOIN "KnowledgeDocument" kd ON kd.id = kc."documentId"
        INNER JOIN "AgentKnowledgeBase" akb ON akb."knowledgeBaseId" = kd."knowledgeBaseId"
        WHERE akb."agentId" = '${agentId}'
      ) combined
      WHERE 1 - (embedding <=> '${vectorStr}'::vector) > 0.7
      ORDER BY similarity DESC
      LIMIT ${topK}
    `)
    return chunks.map((c) => c.content).join('\n\n')
  } catch {
    return ''
  }
}

export async function detectIntention(message: string, intentions: Intention[]): Promise<Intention | null> {
  if (intentions.length === 0) return null
  const intentionList = intentions
    .filter((i) => i.isActive)
    .map((i) => `- ID: ${i.id} | Nome: ${i.name} | Quando usar: ${i.description || ''}`)
    .join('\n')

  const res = await callLLM({
    model: 'claude-haiku-4-5',
    system: 'Você é um classificador de intenções. Analise a mensagem e determine se ela corresponde a alguma intenção listada. Responda APENAS com o ID da intenção ou "none". Nenhum texto adicional.',
    messages: [{ role: 'user', content: `Mensagem: "${message}"\n\nIntenções disponíveis:\n${intentionList}` }],
    maxTokens: 100,
  })

  const intentionId = res.content.trim()
  if (intentionId === 'none') return null
  return intentions.find((i) => i.id === intentionId) || null
}

export async function processAgentResponse(opts: {
  agent: Agent & { config: AgentConfig | null }
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
  userMessage: string
  agentId: string
}): Promise<{ content: string; creditsUsed: number }> {
  const { agent, conversationHistory, userMessage, agentId } = opts

  const knowledgeContext = await retrieveContext(userMessage, agentId)
  const systemPrompt = buildSystemPrompt(agent, agent.config, knowledgeContext)

  const messages = [...conversationHistory, { role: 'user' as const, content: userMessage }]

  const res = await callLLM({
    model: agent.llmModel || 'claude-haiku-4-5',
    system: systemPrompt,
    messages,
    maxTokens: 2048,
  })

  const creditsUsed = calcCredits(res.inputTokens, res.outputTokens, agent.llmModel)
  return { content: res.content, creditsUsed }
}

export async function testAgent(agent: Agent & { config: AgentConfig | null }, message: string) {
  const start = Date.now()
  const knowledgeContext = await retrieveContext(message, agent.id)
  const systemPrompt = buildSystemPrompt(agent, agent.config, knowledgeContext)

  const res = await callLLM({
    model: agent.llmModel || 'claude-haiku-4-5',
    system: systemPrompt,
    messages: [{ role: 'user', content: message }],
  })

  return {
    response: res.content,
    creditsUsed: calcCredits(res.inputTokens, res.outputTokens, agent.llmModel),
    model: agent.llmModel,
    responseTimeMs: Date.now() - start,
  }
}

export async function chunkText(text: string, chunkSize = 500, overlap = 50): Promise<string[]> {
  const words = text.split(/\s+/)
  const chunks: string[] = []
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    chunks.push(words.slice(i, i + chunkSize).join(' '))
    if (i + chunkSize >= words.length) break
  }
  return chunks
}

