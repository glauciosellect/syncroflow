import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import { auditLog } from '../../lib/rbac'
import { uploadAttachment } from '../../lib/storage'
import { isDriveConfigured, downloadFile, assertInsideRoot } from './drive.client'
import {
  getDocumentsConfig, verifyContract, extractIdentifier, getIdentifierKind, findContractFolder,
   type IdentifierKind,
  listContractFiles, pickFile, MAX_VERIFY_TRIES,
} from './documents.service'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Fluxo de entrega de documentos pelo agente. Estado guardado em contact.variables.docFlow
// e a verificação aprovada em contact.variables.docVerified ({ contract, until }).
//
// Regras:
// - O cliente só recebe arquivo depois de passar na verificação (telefone cadastrado + nº do contrato
//   conferido no sistema mãe). Quem confere é o código.
// - A busca é só dentro da pasta do contrato, dentro da pasta raiz compartilhada. Nunca fora dela.
// - Pedido específico → envia o mais recente que casa com o NOME do arquivo.
// - "Tem algum documento para mim?" → só lista os nomes, sem enviar.
// - Não achou → o agente responde conforme as orientações dele (aiNote).

const VERIFIED_TTL_MS = 30 * 60 * 1000
const TRIGGER = /(document|arquivo|projeto|pdf|planta|laudo|parecer|certid|alvar|art\b|rrt|contrato|boleto|segunda via|proposta|relat[oó]rio|enviar|mandar|manda|envia|pront[oa]|dispon[ií]vel|tem algum)/i
const CANCEL = /^(deixa|deixa pra l[aá]|n[aã]o|nao|cancela|cancelar|esquece|nada|outro assunto)[\s.!]*$/i

export type DocFlowResult =
  | { kind: 'none' }
  | { kind: 'reply'; text: string }
  | { kind: 'transfer'; text: string }
  | { kind: 'ai'; note: string }
  | { kind: 'file'; text: string; fileUrl: string; filename: string; mimetype: string; mediaType: 'document' | 'image' }

interface Flow { step: 'await_contract'; mode: 'send' | 'list'; query: string; tries: number }

async function classify(text: string, history: { role: string; content: string }[]): Promise<{ intent: 'send' | 'list' | 'none'; query: string }> {
  try {
    const recent = history.slice(-4).map((m) => `${m.role === 'USER' ? 'Cliente' : 'Agente'}: ${m.content}`).join('\n')
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 120,
      system:
        'Você classifica a ÚLTIMA mensagem de um cliente. Responda SOMENTE um JSON: {"intent":"send"|"list"|"none","query":"..."}.\n' +
        '- "send": o cliente pede para RECEBER um documento/arquivo/projeto específico, ou pergunta se algo está pronto e pode ser enviado. query = o que ele quer (ex.: "projeto estrutural", "ART").\n' +
        '- "list": o cliente pergunta se há documentos/arquivos disponíveis para ele, sem especificar qual. query = "".\n' +
        '- "none": qualquer outro assunto.',
      messages: [{ role: 'user', content: `${recent ? recent + '\n' : ''}Cliente (última mensagem): ${text}` }],
    })
    const raw = res.content.find((b) => b.type === 'text')
    const json = JSON.parse((raw?.type === 'text' ? raw.text : '{}').match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    const intent = json.intent === 'send' || json.intent === 'list' ? json.intent : 'none'
    return { intent, query: String(json.query ?? '') }
  } catch (err: any) {
    logger.warn('Document flow: classificação falhou', { err: err?.message })
    return { intent: 'none', query: '' }
  }
}

function mask(contract: string, kind: IdentifierKind) {
  return kind === 'cpf' ? `***${contract.replace(/\D/g, '').slice(-3)}` : contract
}

async function saveVars(contactId: string, patch: Record<string, any>) {
  const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { variables: true } })
  const vars = { ...((c?.variables as Record<string, any>) || {}), ...patch }
  for (const k of Object.keys(vars)) if (vars[k] === undefined) delete vars[k]
  await prisma.contact.update({ where: { id: contactId }, data: { variables: vars } })
}

async function execute(opts: {
  workspaceId: string; contactId: string; conversationId: string; contract: string; mode: 'send' | 'list'; query: string
  rootFolderId: string; kind: IdentifierKind
}): Promise<DocFlowResult> {
  const { workspaceId, contactId, contract, mode, query, rootFolderId, kind } = opts
  const folder = await findContractFolder(rootFolderId, contract, kind)
  if (!folder) {
    return { kind: 'ai', note: `A verificação do cliente passou, mas não existe pasta dele no Drive. Responda conforme suas orientações (ex.: ainda não há documentos disponíveis) e não invente arquivos.` }
  }
  await assertInsideRoot(folder.id, rootFolderId)
  const files = await listContractFiles(folder.id)

  await auditLog({
    workspaceId, action: mode === 'list' ? 'documents.listed' : 'documents.requested', resourceType: 'contact', resourceId: contactId,
    metadata: { contract: mask(contract, kind), query, filesFound: files.length },
  })

  if (mode === 'list') {
    if (files.length === 0) return { kind: 'ai', note: 'O cliente perguntou quais documentos existem, mas a pasta dele está vazia. Responda conforme suas orientações e não invente arquivos.' }
    const names = files.slice(0, 15).map((f, i) => `${i + 1}. ${f.name}`).join('\n')
    const more = files.length > 15 ? `\n...e mais ${files.length - 15}.` : ''
    return { kind: 'reply', text: `Encontrei estes documentos disponíveis para você:\n\n${names}${more}\n\nQual deles você quer que eu envie?` }
  }

  const file = pickFile(files, query)
  if (!file) {
    return { kind: 'ai', note: `Busca no Drive não encontrou arquivo para o pedido "${query}" (verificação do cliente OK). Responda conforme suas orientações (ex.: ainda não está pronto) e não invente arquivos.` }
  }
  const dl = await downloadFile(file, rootFolderId)
  const { publicUrl } = await uploadAttachment(workspaceId, dl.buffer, dl.mimetype, dl.filename)
  await auditLog({
    workspaceId, action: 'documents.sent', resourceType: 'contact', resourceId: contactId,
    metadata: { contract: mask(contract, kind), driveFileId: file.id, filename: dl.filename },
  })
  return {
    kind: 'file',
    text: `Aqui está o arquivo "${dl.filename}". 📎`,
    fileUrl: publicUrl, filename: dl.filename, mimetype: dl.mimetype,
    mediaType: dl.mimetype.startsWith('image/') ? 'image' : 'document',
  }
}

export async function handleDocumentTurn(opts: {
  workspaceId: string
  contact: { id: string; phone?: string | null; externalId?: string | null; variables: any }
  conversationId: string
  text: string
  history: { role: string; content: string }[]
}): Promise<DocFlowResult> {
  const { workspaceId, contact, conversationId, text, history } = opts
  try {
    if (!isDriveConfigured()) return { kind: 'none' }
    const cfg = await getDocumentsConfig(workspaceId)
    if (!cfg.enabled || !cfg.rootFolderId) return { kind: 'none' }

    const vars = (contact.variables as Record<string, any>) || {}
    const phone = contact.phone || contact.externalId || ''
    const flow = vars.docFlow as Flow | undefined
    const kind = await getIdentifierKind(workspaceId)
    const label = kind === 'cpf' ? 'CPF' : 'número do contrato'
    const verified = vars.docVerified as { contract: string; until: string } | undefined
    const verifiedActive = !!verified && new Date(verified.until).getTime() > Date.now()

    // 1) Estamos esperando o número do contrato
    if (flow?.step === 'await_contract') {
      if (CANCEL.test(text.trim())) {
        await saveVars(contact.id, { docFlow: undefined })
        return { kind: 'none' }
      }
      const candidate = extractIdentifier(text, kind)
      const tries = flow.tries + 1
      const result = candidate
        ? await verifyContract({ workspaceId, contactId: contact.id, phone, contract: candidate })
        : { valid: false as const, reason: 'not_found' as const }

      if (result.valid && candidate) {
        await saveVars(contact.id, {
          docFlow: undefined,
          docVerified: { contract: candidate, until: new Date(Date.now() + VERIFIED_TTL_MS).toISOString() },
        })
        await auditLog({ workspaceId, action: 'documents.verified', resourceType: 'contact', resourceId: contact.id, metadata: { contract: mask(candidate, kind) } })
        return execute({ workspaceId, contactId: contact.id, conversationId, contract: candidate, mode: flow.mode, query: flow.query, rootFolderId: cfg.rootFolderId, kind })
      }

      await auditLog({ workspaceId, action: 'documents.verify_failed', resourceType: 'contact', resourceId: contact.id, metadata: { tries, reason: result.reason ?? 'not_found' } })
      if (result.reason === 'unavailable') {
        await saveVars(contact.id, { docFlow: undefined })
        return { kind: 'transfer', text: 'No momento não consegui confirmar seus dados. Vou chamar um atendente para te ajudar com isso. 🙏' }
      }
      if (tries >= MAX_VERIFY_TRIES) {
        await saveVars(contact.id, { docFlow: undefined })
        return { kind: 'transfer', text: `Não consegui confirmar o seu ${label} com o cadastro. Por segurança, vou passar seu atendimento para uma pessoa da equipe. 🙏` }
      }
      await saveVars(contact.id, { docFlow: { ...flow, tries } })
      return { kind: 'reply', text: `Não consegui confirmar esse ${label} com o seu cadastro. Pode conferir e me enviar de novo, por favor?` }
    }

    // 2) Mensagem normal: será que é um pedido de documento?
    if (!TRIGGER.test(text)) return { kind: 'none' }
    const intent = await classify(text, history)
    if (intent.intent === 'none') return { kind: 'none' }

    if (verifiedActive) {
      return execute({ workspaceId, contactId: contact.id, conversationId, contract: verified!.contract, mode: intent.intent, query: intent.query, rootFolderId: cfg.rootFolderId, kind })
    }

    await saveVars(contact.id, { docFlow: { step: 'await_contract', mode: intent.intent, query: intent.query, tries: 0 } satisfies Flow })
    return { kind: 'reply', text: `Posso verificar isso para você. Por segurança, me informe o seu ${label}, por favor.` }
  } catch (err: any) {
    logger.error('Document flow: erro', { err: err?.message })
    return { kind: 'ai', note: 'Houve uma falha técnica ao consultar os documentos. Peça desculpas e diga que um atendente vai ajudar, sem inventar arquivos.' }
  }
}
