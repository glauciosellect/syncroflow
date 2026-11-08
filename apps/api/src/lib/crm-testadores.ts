import axios from 'axios'
import { prisma } from './prisma'
import { logger } from './logger'

// Envia os cadastros do SyncroFlow para o painel "Testadores" do CRM NuClick.
// Ativa só se CRM_INGEST_KEY estiver definida (mesma chave do CRM). Nunca derruba a API.
//   CRM_INGEST_KEY   obrigatória
//   CRM_INGEST_URL   opcional (padrão: https://nuclick-crm.vercel.app/api/leads/ingest)

const URL_PADRAO = 'https://nuclick-crm.vercel.app/api/leads/ingest'
const INTERNOS = [/@nuclick\.com\.br$/i, /^glaucio\.sellect@gmail\.com$/i]
const LOTE = 200

export async function sincronizarTestadores(desdeMs: number | null): Promise<number> {
  const key = process.env.CRM_INGEST_KEY
  if (!key) return 0
  const desde = desdeMs ? new Date(Date.now() - desdeMs) : null

  const users = await prisma.user.findMany({
    where: desde
      ? { OR: [{ createdAt: { gt: desde } }, { sessions: { some: { createdAt: { gt: desde } } } }] }
      : {},
    select: {
      id: true, name: true, email: true, phone: true, createdAt: true,
      sessions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      workspaceMembers: { select: { workspace: { select: { name: true, plan: true } } }, take: 5 },
    },
    orderBy: { createdAt: 'asc' },
    take: 5000,
  })

  const itens = users
    .filter(u => u.email && !INTERNOS.some(r => r.test(u.email)))
    .map(u => {
      const ws = u.workspaceMembers.map(m => m.workspace)
      return {
        produto: 'syncroflow',
        external_id: u.id,
        nome: u.name,
        email: u.email,
        telefone: u.phone,
        empresa: ws[0]?.name ?? null,
        cadastrado_em: u.createdAt.toISOString(),
        // SyncroFlow não exige confirmação de e-mail: considera confirmado no cadastro
        email_confirmado_em: u.createdAt.toISOString(),
        ultimo_acesso_em: (u.sessions[0]?.createdAt ?? null)?.toISOString() ?? null,
        convertido: ws.some(w => w.plan !== 'TRIAL'),
        metadados: { origem: 'syncroflow', planos: ws.map(w => w.plan) },
      }
    })

  const url = process.env.CRM_INGEST_URL || URL_PADRAO
  let enviados = 0
  for (let i = 0; i < itens.length; i += LOTE) {
    const lote = itens.slice(i, i + LOTE)
    await axios.post(url, lote, { headers: { 'x-ingest-key': key }, timeout: 20000 })
    enviados += lote.length
  }
  return enviados
}

/** Carga completa 1x ao subir + atualização a cada 30 min (cadastros/entradas recentes). */
export function startCrmTestadoresSync() {
  if (!process.env.CRM_INGEST_KEY) {
    logger.info('[CRM-SYNC] CRM_INGEST_KEY ausente — sincronização de testadores desativada')
    return
  }
  const rodar = (desdeMs: number | null) =>
    sincronizarTestadores(desdeMs)
      .then(n => logger.info(`[CRM-SYNC] ${n} testador(es) enviados ao CRM`))
      .catch((err: any) => logger.error(`[CRM-SYNC] falha: ${err?.response?.status ?? ''} ${err?.message}`))

  setTimeout(() => { void rodar(null) }, 60_000)
  setInterval(() => { void rodar(2 * 60 * 60 * 1000) }, 30 * 60 * 1000)
}
