import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const BUCKET = 'chat-attachments'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function uploadAttachment(
  workspaceId: string,
  fileBuffer: Buffer,
  mimetype: string,
  originalName: string
): Promise<{ path: string; publicUrl: string }> {
  const ext = originalName.includes('.') ? originalName.split('.').pop() : ''
  const path = `${workspaceId}/${randomUUID()}${ext ? `.${ext}` : ''}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, fileBuffer, { contentType: mimetype, upsert: false })

  if (error) throw new Error(`Falha ao subir anexo: ${error.message}`)

  // Bucket é privado — signed URL válida por 1 ano. Não há hoje campo no banco
  // para guardar o `path` e renovar sob demanda, então a validade longa evita
  // que anexos de conversas antigas quebrem silenciosamente na tela do chat.
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365)

  if (signError || !signed) throw new Error(`Falha ao gerar URL do anexo: ${signError?.message}`)

  return { path, publicUrl: signed.signedUrl }
}

export async function refreshAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365)

  if (error || !data) throw new Error(`Falha ao renovar URL do anexo: ${error?.message}`)
  return data.signedUrl
}
