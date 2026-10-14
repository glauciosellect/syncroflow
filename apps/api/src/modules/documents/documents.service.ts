import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import { decrypt, encrypt } from '../../lib/crypto'
import { normalizeBrazilianNumber } from '../channels/whatsapp/providers/meta-cloud.provider'
import { DriveFile, listChildren, listFilesRecursive, isFolder } from './drive.client'

export const DOCS_PLATFORM = 'gdrive'
export const MAX_VERIFY_TRIES = 3

export interface DocumentsConfig {
  enabled: boolean
  rootFolderId?: string
  rootFolderName?: string
  // Sistema mãe (SyncroLex, GestorBIM, GestorAMA...) que confirma "este contrato é deste telefone".
  verifyUrl?: string
  hasVerifyToken: boolean
  // Texto do que o agente diz quando não encontra o arquivo (além da orientação normal do agente).
  notFoundHint?: string
}

export async function getDocumentsConfig(workspaceId: string): Promise<DocumentsConfig> {
  const row = await prisma.integration.findUnique({ where: { workspaceId_platform: { workspaceId, platform: DOCS_PLATFORM } } })
  const m = (row?.metadata as any) || {}
  return {
    enabled: !!row && row.status === 'active' && m.enabled !== false && !!m.rootFolderId,
    rootFolderId: m.rootFolderId,
    rootFolderName: m.rootFolderName,
    verifyUrl: m.verifyUrl,
    hasVerifyToken: !!row?.accessToken,
    notFoundHint: m.notFoundHint,
  }
}

export async function saveDocumentsConfig(workspaceId: string, cfg: {
  enabled: boolean
  rootFolderId?: string
  rootFolderName?: string
  verifyUrl?: string
  verifyToken?: string // só grava se vier preenchido
  notFoundHint?: string
}) {
  const existing = await prisma.integration.findUnique({ where: { workspaceId_platform: { workspaceId, platform: DOCS_PLATFORM } } })
  const metadata = {
    ...((existing?.metadata as any) || {}),
    enabled: cfg.enabled,
    rootFolderId: cfg.rootFolderId,
    rootFolderName: cfg.rootFolderName,
    verifyUrl: cfg.verifyUrl || null,
    notFoundHint: cfg.notFoundHint || null,
  } as any
  const accessToken = cfg.verifyToken ? encrypt(cfg.verifyToken) : existing?.accessToken ?? null
  await prisma.integration.upsert({
    where: { workspaceId_platform: { workspaceId, platform: DOCS_PLATFORM } },
    create: { workspaceId, platform: DOCS_PLATFORM, status: 'active', metadata, accessToken },
    update: { status: 'active', metadata, accessToken },
  })
}

// ─── Normalização / casamento por tokens ─────────────────────────────────────

function strip(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
export function tokens(s: string): string[] {
  return strip(s).split(/[^a-z0-9]+/).filter(Boolean)
}
const STOPWORDS = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'para', 'por', 'com', 'que', 'e', 'me', 'meu', 'minha', 'favor', 'pode', 'poder', 'enviar', 'mandar', 'manda', 'envia', 'quero', 'preciso', 'gostaria', 'arquivo', 'documento', 'pdf', 'projeto', 'esta', 'esta', 'pronto', 'ja', 'se', 'ai', 'la'])

// "folder tokens" contém "contract tokens" como subsequência contígua (evita 1234 casar com 12345).
function containsSequence(hay: string[], needle: string[]) {
  if (!needle.length) return false
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((t, j) => hay[i + j] === t)) return true
  }
  return false
}

export function normalizeContract(raw: string): string {
  return strip(raw).replace(/[^a-z0-9]+/g, ' ').trim()
}

export function extractContractCandidate(text: string): string | null {
  // Pega o primeiro trecho com algum dígito, ex.: "1234", "CT-2026/045", "contrato 1234".
  const m = text.match(/(?:[A-Za-z]{1,5}[-\/])?\d[\dA-Za-z\-\/\.]{0,20}/)
  const cand = m?.[0]?.trim()
  if (!cand) return null
  const n = normalizeContract(cand)
  return n.length >= 2 ? cand : null
}

// ─── Verificação de identidade (telefone + número do contrato) ───────────────

export interface VerifyResult { valid: boolean; reason?: 'not_found' | 'phone_mismatch' | 'unavailable' }

/**
 * Quem decide é o CÓDIGO, não a IA:
 * 1) Se há sistema mãe configurado (verifyUrl), pergunta a ele: este contrato pertence a este telefone?
 * 2) Sem sistema mãe, só aceita se o contato tem o contrato registrado em variables.contrato.
 */
export async function verifyContract(opts: {
  workspaceId: string
  contactId: string
  phone: string
  contract: string
}): Promise<VerifyResult> {
  const cfg = await getDocumentsConfig(opts.workspaceId)
  const phone = normalizeBrazilianNumber(opts.phone)

  if (cfg.verifyUrl) {
    const row = await prisma.integration.findUnique({ where: { workspaceId_platform: { workspaceId: opts.workspaceId, platform: DOCS_PLATFORM } } })
    const token = row?.accessToken ? decrypt(row.accessToken) : ''
    try {
      const res = await fetch(cfg.verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ event: 'contract.verify', phone, contract: opts.contract }),
      })
      if (!res.ok) {
        logger.error('Verificação de contrato: sistema mãe retornou erro', { status: res.status })
        return { valid: false, reason: 'unavailable' }
      }
      const data = (await res.json()) as any
      return data?.valid === true ? { valid: true } : { valid: false, reason: 'not_found' }
    } catch (err: any) {
      logger.error('Verificação de contrato: falha de conexão com o sistema mãe', { err: err?.message })
      return { valid: false, reason: 'unavailable' }
    }
  }

  const contact = await prisma.contact.findUnique({ where: { id: opts.contactId }, select: { variables: true } })
  const registered = String((contact?.variables as any)?.contrato ?? '')
  if (registered && normalizeContract(registered) === normalizeContract(opts.contract)) return { valid: true }
  return { valid: false, reason: 'not_found' }
}

// ─── Busca no Drive ──────────────────────────────────────────────────────────

export async function findContractFolder(rootFolderId: string, contract: string): Promise<DriveFile | null> {
  const want = tokens(contract)
  const children = (await listChildren(rootFolderId)).filter(isFolder)
  const matches = children.filter((f) => containsSequence(tokens(f.name), want))
  if (matches.length > 1) logger.warn('Drive: mais de uma pasta casa com o contrato; usando a mais recente', { contract })
  return matches.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))[0] ?? null
}

export function queryTokens(query: string): string[] {
  return tokens(query).filter((t) => !STOPWORDS.has(t) && t.length > 1)
}

// Escolhe o arquivo que melhor casa com o pedido (pelo NOME); empate → o mais recente.
export function pickFile(files: DriveFile[], query: string): DriveFile | null {
  const q = queryTokens(query)
  if (!q.length) return null
  let best: { f: DriveFile; score: number } | null = null
  for (const f of files) {
    const nameTokens = tokens(f.name)
    const score = q.filter((t) => nameTokens.some((n) => n === t || (t.length >= 4 && n.startsWith(t)))).length
    if (score === 0) continue
    if (!best || score > best.score || (score === best.score && f.modifiedTime > best.f.modifiedTime)) best = { f, score }
  }
  // exige que pelo menos metade dos termos do pedido case, senão é um palpite fraco demais
  if (!best || best.score < Math.ceil(q.length / 2)) return null
  return best.f
}

export async function listContractFiles(folderId: string): Promise<DriveFile[]> {
  return (await listFilesRecursive(folderId, 3)).sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
}
