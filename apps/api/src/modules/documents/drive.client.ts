import crypto from 'crypto'
import { logger } from '../../lib/logger'

// Cliente mínimo do Google Drive por CONTA DE SERVIÇO (somente leitura).
//
// Segurança: a conta de serviço só enxerga o que o cliente compartilhou com o e-mail dela,
// então o resto do Drive do cliente nem existe para o SyncroFlow. Além disso, todo acesso a
// arquivo passa por assertInsideRoot(): o arquivo precisa estar dentro da pasta raiz
// configurada, senão a operação é recusada — mesmo que alguém consiga um ID de fora.

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const MAX_FILE_BYTES = 15 * 1024 * 1024 // limite prático do WhatsApp para documentos é maior, mas 15MB protege memória

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  size?: string
  parents?: string[]
}

interface ServiceAccount { client_email: string; private_key: string }

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
    const json = JSON.parse(text)
    if (!json.client_email || !json.private_key) return null
    return { client_email: json.client_email, private_key: String(json.private_key).replace(/\\n/g, '\n') }
  } catch {
    return null
  }
}

export function getServiceAccountEmail(): string | null {
  return loadServiceAccount()?.client_email ?? null
}

export function isDriveConfigured(): boolean {
  return !!loadServiceAccount()
}

let cachedToken: { token: string; exp: number } | null = null

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token
  const sa = loadServiceAccount()
  if (!sa) throw new Error('Conta de serviço do Google Drive não configurada no servidor')
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }))
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(sa.private_key)
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${b64url(signature)}`,
    }),
  })
  const data = (await res.json()) as any
  if (!res.ok || !data.access_token) throw new Error(`Falha ao autenticar no Google Drive: ${data.error_description || data.error || res.status}`)
  cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return cachedToken.token
}

async function driveGet(path: string, params: Record<string, string> = {}): Promise<Response> {
  const token = await getAccessToken()
  const qs = new URLSearchParams({ supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...params })
  return fetch(`${DRIVE_API}${path}?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
}

export function extractFolderId(input: string): string | null {
  const s = (input || '').trim()
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/)
  if (m) return m[1]
  return /^[a-zA-Z0-9_-]{10,}$/.test(s) ? s : null
}

export async function getFile(fileId: string): Promise<DriveFile | null> {
  const res = await driveGet(`/files/${encodeURIComponent(fileId)}`, { fields: 'id,name,mimeType,modifiedTime,size,parents' })
  if (!res.ok) return null
  return (await res.json()) as DriveFile
}

export async function listChildren(folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const res = await driveGet('/files', {
      q: `'${folderId.replace(/'/g, '')}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,size,parents)',
      pageSize: '200',
      ...(pageToken ? { pageToken } : {}),
    })
    if (!res.ok) throw new Error(`Drive recusou a listagem (${res.status}). A pasta foi compartilhada com o e-mail do SyncroFlow?`)
    const data = (await res.json()) as any
    out.push(...(data.files ?? []))
    pageToken = data.nextPageToken
  } while (pageToken && out.length < 1000)
  return out
}

export function isFolder(f: DriveFile) {
  return f.mimeType === FOLDER_MIME
}

// Sobe pelos pais do arquivo até achar a raiz configurada (máx. 10 níveis).
export async function assertInsideRoot(fileId: string, rootId: string): Promise<void> {
  let currentId = fileId
  for (let depth = 0; depth < 10; depth++) {
    if (currentId === rootId) return
    const f = await getFile(currentId)
    if (!f) break
    if (f.id === rootId) return
    const parent = f.parents?.[0]
    if (!parent) break
    if (parent === rootId) return
    currentId = parent
  }
  logger.warn('Drive: tentativa de acesso a arquivo fora da pasta raiz recusada', { fileId, rootId })
  throw new Error('Arquivo fora da pasta autorizada')
}

// Lista arquivos (não pastas) abaixo de uma pasta, até 3 níveis de profundidade.
// Todos os itens vêm de listChildren a partir de pasta já dentro da raiz — não há busca livre no Drive.
export async function listFilesRecursive(folderId: string, depth = 3): Promise<DriveFile[]> {
  const children = await listChildren(folderId)
  const files = children.filter((c) => !isFolder(c))
  if (depth <= 1) return files
  for (const sub of children.filter(isFolder)) {
    files.push(...(await listFilesRecursive(sub.id, depth - 1)))
  }
  return files
}

export async function downloadFile(file: DriveFile, rootId: string): Promise<{ buffer: Buffer; mimetype: string; filename: string }> {
  await assertInsideRoot(file.id, rootId)
  const isGoogleDoc = file.mimeType.startsWith('application/vnd.google-apps.')
  if (!isGoogleDoc && file.size && Number(file.size) > MAX_FILE_BYTES) throw new Error('Arquivo muito grande para enviar pelo WhatsApp')
  const res = isGoogleDoc
    ? await driveGet(`/files/${encodeURIComponent(file.id)}/export`, { mimeType: 'application/pdf' })
    : await driveGet(`/files/${encodeURIComponent(file.id)}`, { alt: 'media' })
  if (!res.ok) throw new Error(`Falha ao baixar arquivo do Drive (${res.status})`)
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > MAX_FILE_BYTES) throw new Error('Arquivo muito grande para enviar pelo WhatsApp')
  return {
    buffer,
    mimetype: isGoogleDoc ? 'application/pdf' : file.mimeType,
    filename: isGoogleDoc && !file.name.toLowerCase().endsWith('.pdf') ? `${file.name}.pdf` : file.name,
  }
}
