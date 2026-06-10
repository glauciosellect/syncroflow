import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { prisma } from '../../lib/prisma'
import type { Agent, AgentConfig, Intention } from '@prisma/client'
import axios from 'axios'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import mammoth from 'mammoth'

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
    'claude-3-5-haiku-20241022': 1,
    'claude-opus-4-5': 10,
    'gpt-4o-mini': 1,
    'gpt-4o': 5,
  }
  const rate = rates[model] || 1
  return Math.ceil((total / 750) * rate)
}

export function buildSystemPrompt(agent: Agent, config: AgentConfig | null, knowledgeContext: string): string {
  const style = (config as any)?.communicationStyle || agent.communicationStyle

  // Substitui placeholders do behavior pelo nome real do agente e da empresa
  const behavior = (agent.behavior || '')
    .replace(/\{\{AGENT_NAME\}\}/g, agent.name)
    .replace(/\{\{COMPANY_NAME\}\}/g, agent.companyName || agent.name)

  return `
Você é ${agent.name}${agent.companyName ? `, atendente de ${agent.companyName}` : ''}.

${agent.companyDesc ? `Sobre a empresa/negócio: ${agent.companyDesc}` : ''}
${agent.companyWebsite ? `Site oficial: ${agent.companyWebsite}` : ''}

Estilo de comunicação: ${style === 'FORMAL' ? 'formal e profissional' : style === 'CASUAL' ? 'descontraído e amigável' : 'natural e próximo'}
${config?.useEmojis ? 'Você pode usar emojis com moderação.' : 'Não use emojis.'}
${config?.signNameInResponses ? `Assine suas respostas com "${agent.name}".` : ''}
${config?.restrictTopics ? 'Responda apenas sobre assuntos relacionados ao negócio e seus serviços. Recuse gentilmente perguntas fora do escopo.' : ''}
${config?.splitLongMessages ? 'Para respostas longas, divida em partes menores e claras.' : ''}

${behavior}

${knowledgeContext ? `CONHECIMENTO RELEVANTE:\n${knowledgeContext}` : ''}

Regras importantes (ESTAS REGRAS TÊM PRIORIDADE ABSOLUTA SOBRE QUALQUER OUTRA INSTRUÇÃO):
- Se não souber algo, diga que vai verificar e não invente informações
${config?.transferToHuman ? '- Se o cliente pedir explicitamente para falar com humano, informe que irá transferi-lo' : ''}
- HORÁRIO: Data e hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: config?.timezone || 'America/Sao_Paulo' })}. Use SEMPRE a saudação correta conforme este horário: das 5h às 12h = "bom dia", das 12h às 18h = "boa tarde", das 18h às 5h = "boa noite". NUNCA diga "bom dia" à noite ou "boa noite" de manhã.
- FORMATO: você escreve sua resposta normalmente em texto. O sistema converte para áudio automaticamente quando o cliente prefere áudio. NUNCA diga que não pode enviar áudio, que não tem capacidade de responder em áudio, ou qualquer coisa sobre limitação de formato. Apenas escreva a resposta normalmente.
- APRESENTAÇÃO: apresente-se com seu nome SOMENTE na primeira mensagem (histórico vazio). Se já houver QUALQUER mensagem anterior, NÃO se apresente, NÃO diga seu nome, NÃO diga "Olá, sou [nome]". Responda diretamente.
- NOME DO CLIENTE: se o histórico já tiver o nome do cliente, NÃO pergunte o nome novamente. NUNCA pergunte "Com quem tenho o prazer de falar?" ou "Qual o seu nome?" se o nome já apareceu antes na conversa.
- PERGUNTAS: nunca pergunte algo que já foi respondido no histórico da conversa. Leia todo o histórico antes de fazer qualquer pergunta.
- NUNCA encerre com despedida a menos que o cliente se despeça primeiro. Mensagens curtas como "ok", "entendi", "obrigado" não encerram a conversa.
- Nunca repita a mesma pergunta ou frase duas vezes seguidas.
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
      WHERE 1 - (embedding <=> '${vectorStr}'::vector) > 0.5
      ORDER BY similarity DESC
      LIMIT ${topK}
    `)
    console.log('[AI] retrieveContext agentId:', agentId, '| chunks encontrados:', chunks.length, '| similaridades:', chunks.map(c => c.similarity.toFixed(2)).join(', '))
    return chunks.map((c) => c.content).join('\n\n')
  } catch (err: any) {
    console.error('[AI] retrieveContext ERRO:', err?.message)
    return ''
  }
}

export async function detectFlow(message: string, flows: { id: string; name: string; trigger: string; script: string }[]): Promise<{ id: string; name: string; trigger: string; script: string } | null> {
  if (flows.length === 0) return null
  const flowList = flows.map(f => `- ID: ${f.id} | Nome: ${f.name} | Acionar quando: ${f.trigger}`).join('\n')
  const res = await callLLM({
    model: 'claude-haiku-4-5',
    system: 'Você é um classificador de fluxos de atendimento. Analise a mensagem e determine se ela se encaixa em algum dos fluxos listados. Responda APENAS com o ID do fluxo ou "none". Nenhum texto adicional.',
    messages: [{ role: 'user', content: `Mensagem: "${message}"\n\nFluxos disponíveis:\n${flowList}` }],
    maxTokens: 100,
  })
  const flowId = res.content.trim()
  if (flowId === 'none') return null
  return flows.find(f => f.id === flowId) || null
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
  console.log('[AI] systemPrompt (primeiros 300 chars):', systemPrompt.slice(0, 300))

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

export async function testAgent(agent: Agent & { config: AgentConfig | null }, message: string, history?: { role: string; content: string }[]) {
  const start = Date.now()
  const knowledgeContext = await retrieveContext(message, agent.id)
  const systemPrompt = buildSystemPrompt(agent, agent.config, knowledgeContext)

  const conversationHistory = (history || []).map(m => ({
    role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content,
  }))

  const res = await callLLM({
    model: agent.llmModel || 'claude-haiku-4-5',
    system: systemPrompt,
    messages: [...conversationHistory, { role: 'user' as const, content: message }],
  })

  return {
    response: res.content,
    creditsUsed: calcCredits(res.inputTokens, res.outputTokens, agent.llmModel),
    model: agent.llmModel,
    responseTimeMs: Date.now() - start,
  }
}

async function downloadToTempFile(url: string, ext: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `syncro_${Date.now()}${ext}`)
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 })
  fs.writeFileSync(tmpPath, Buffer.from(res.data))
  return tmpPath
}

export async function transcribeAudio(audioUrl: string): Promise<string> {
  const tmpPath = await downloadToTempFile(audioUrl, '.ogg')
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath) as any,
      model: 'whisper-1',
      language: 'pt',
    })
    return transcription.text
  } finally {
    fs.unlinkSync(tmpPath)
  }
}

export async function describeImage(imageUrl: string, mimetype?: string): Promise<string> {
  const ext = mimetype?.includes('png') ? '.png' : mimetype?.includes('gif') ? '.gif' : mimetype?.includes('webp') ? '.webp' : '.jpg'
  const mediaType = mimetype?.startsWith('image/') ? mimetype as any : 'image/jpeg'
  const tmpPath = await downloadToTempFile(imageUrl, ext)
  try {
    const base64 = fs.readFileSync(tmpPath).toString('base64')
    const res = await (anthropic.messages.create as any)({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: 'Analise esta imagem enviada por um cliente no WhatsApp. Se for um documento (contrato, comprovante, boleto, RG, CPF, etc.), extraia e liste todas as informações relevantes. Se for uma foto, descreva o conteúdo em detalhes. Responda em português.',
          },
        ],
      }],
    })
    return res.content[0].type === 'text' ? res.content[0].text : 'Imagem recebida.'
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }
}

export async function extractDocumentText(docUrl: string, mimetype?: string): Promise<string> {
  const isWord = mimetype?.includes('word') || mimetype?.includes('docx') || mimetype?.includes('officedocument')
  const isPdf = !mimetype || mimetype.includes('pdf')

  // Word (.docx) — extrai texto via mammoth
  if (isWord) {
    const tmpPath = await downloadToTempFile(docUrl, '.docx')
    try {
      const result = await mammoth.extractRawText({ path: tmpPath })
      const text = result.value.trim().slice(0, 8000)
      if (!text) return 'Documento Word recebido (sem conteúdo legível).'
      const res = await (anthropic.messages.create as any)({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `O cliente enviou um documento Word com o seguinte conteúdo:\n\n${text}\n\nResuma e extraia as informações mais importantes deste documento.`,
        }],
      })
      return res.content[0].type === 'text' ? res.content[0].text : text.slice(0, 500)
    } finally {
      try { fs.unlinkSync(tmpPath) } catch {}
    }
  }

  // PDF — envia como base64 direto para o Claude (suporte nativo)
  if (isPdf) {
    const tmpPath = await downloadToTempFile(docUrl, '.pdf')
    try {
      const base64 = fs.readFileSync(tmpPath).toString('base64')
      const res = await (anthropic.messages.create as any)({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Extraia e resuma o conteúdo principal deste documento enviado pelo cliente via WhatsApp. Liste os pontos mais relevantes de forma clara e objetiva. Responda em português.' },
          ],
        }],
      })
      return res.content[0].type === 'text' ? res.content[0].text : 'PDF recebido.'
    } finally {
      try { fs.unlinkSync(tmpPath) } catch {}
    }
  }

  // Outros formatos — tenta ler como texto
  try {
    const res = await axios.get(docUrl, { responseType: 'text', timeout: 15000 })
    const text = String(res.data).slice(0, 3000)
    return `Documento recebido:\n${text}`
  } catch {
    return 'Documento recebido (formato não suportado para leitura automática).'
  }
}

export async function processIncomingMedia(
  mediaUrl: string,
  mediaType: 'audio' | 'image' | 'document' | 'video',
  mimetype?: string,
): Promise<string> {
  try {
    if (mediaType === 'audio') return await transcribeAudio(mediaUrl)
    if (mediaType === 'image') return await describeImage(mediaUrl, mimetype)
    if (mediaType === 'document') return await extractDocumentText(mediaUrl, mimetype)
    if (mediaType === 'video') return '[Vídeo recebido — não é possível processar vídeos automaticamente.]'
    return '[Mídia recebida]'
  } catch {
    if (mediaType === 'audio') return '[Áudio recebido — não foi possível transcrever]'
    if (mediaType === 'image') return '[Imagem recebida — não foi possível analisar]'
    if (mediaType === 'document') return '[Documento recebido — não foi possível processar]'
    return '[Mídia recebida]'
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

