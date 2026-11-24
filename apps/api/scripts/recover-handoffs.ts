/**
 * Recupera conversas "esquecidas": a IA disse que ia transferir / avisar a equipe, mas a conversa
 * ficou como "IA ativa" e ninguém humano foi chamado.
 *
 * Simulação (não altera nada, só lista):
 *   cd apps/api && npx tsx scripts/recover-handoffs.ts
 *   cd apps/api && npx tsx scripts/recover-handoffs.ts --workspace=<id>
 *
 * Aplicar (move para "Aguardando humano"; NÃO dispara avisos para a equipe, para não encher o celular):
 *   cd apps/api && npx tsx scripts/recover-handoffs.ts --apply
 *
 * Critério: conversa AI_ACTIVE cuja ÚLTIMA mensagem da IA prometeu passar para humano e depois dela
 * nenhum humano da equipe respondeu. Janela padrão: últimos 30 dias (--days=N).
 */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { aiPromisedHandoff } from '../src/lib/handoff'

const apply = process.argv.includes('--apply')
const wsArg = process.argv.find((a) => a.startsWith('--workspace='))?.split('=')[1]
const days = Number(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 30)

async function main() {
  const since = new Date(Date.now() - days * 86400000)
  const convs = await prisma.conversation.findMany({
    where: { status: 'AI_ACTIVE', updatedAt: { gte: since }, ...(wsArg ? { workspaceId: wsArg } : {}) },
    select: {
      id: true, workspaceId: true, updatedAt: true,
      contact: { select: { name: true, phone: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 12, select: { role: true, content: true, createdAt: true } },
    },
  })

  const hits: { id: string; workspaceId: string; who: string; promise: string; summary: string }[] = []
  for (const c of convs) {
    // mensagens vêm da mais nova para a mais antiga
    const lastAi = c.messages.find((m) => m.role === 'ASSISTANT')
    if (!lastAi || !aiPromisedHandoff(lastAi.content)) continue
    const humanAfter = c.messages.some((m) => m.role === 'HUMAN' && m.createdAt > lastAi.createdAt)
    if (humanAfter) continue
    const lastUser = c.messages.find((m) => m.role === 'USER')
    hits.push({
      id: c.id,
      workspaceId: c.workspaceId,
      who: c.contact?.name || c.contact?.phone || 'Sem nome',
      promise: lastAi.content.replace(/\s+/g, ' ').slice(0, 90),
      summary: (lastUser?.content ?? lastAi.content).slice(0, 500),
    })
  }

  console.log(`${apply ? 'APLICANDO' : 'SIMULAÇÃO'} — ${hits.length} conversa(s) de ${convs.length} abertas na janela de ${days} dias\n`)
  for (const h of hits) console.log(`• ${h.who}  [${h.id}]\n    IA disse: "${h.promise}"`)

  if (apply) {
    for (const h of hits) {
      await prisma.conversation.update({ where: { id: h.id }, data: { status: 'WAITING_HUMAN', transferSummary: h.summary } })
      await prisma.message.create({ data: { conversationId: h.id, role: 'SYSTEM', content: 'Cliente aguardando atendimento da equipe.', creditsUsed: 0 } })
    }
    console.log(`\n✔ ${hits.length} conversa(s) movida(s) para Aguardando humano.`)
  } else if (hits.length) {
    console.log('\nNada foi alterado. Para aplicar, rode de novo com --apply.')
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
