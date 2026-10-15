/**
 * Teste simulado da integração TikTok — roda 100% local, sem banco, Redis, IA ou TikTok real.
 *
 *   cd apps/api && npx tsx scripts/tiktok-simulate.ts
 *
 * Sobe um "TikTok falso" (HTTP local) e valida: assinatura do webhook, roteamento do evento,
 * busca do comentário, resposta pública e encurtamento para 150 caracteres.
 * O que NÃO cobre: formato real das respostas do TikTok (só dá para confirmar com o app aprovado).
 */
import http from 'http'
import crypto from 'crypto'
import type { AddressInfo } from 'net'

const APP_SECRET = 'segredo-de-teste'
const BUSINESS_ID = 'biz-123'
const VIDEO_ID = '7000000000000000001'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) { passed++; console.log(`  ✔ ${name}`) }
  else { failed++; console.log(`  ✘ ${name}`, extra ?? '') }
}

// ── TikTok falso ────────────────────────────────────────────────────────────
const apiCalls: { method: string; path: string; headers: http.IncomingHttpHeaders; body: any }[] = []
const fakeTikTok = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const url = new URL(req.url || '', 'http://x')
    const body = raw ? JSON.parse(raw) : undefined
    apiCalls.push({ method: req.method || '', path: url.pathname, headers: req.headers, body })
    const ok = (data: unknown) => res.end(JSON.stringify({ code: 0, message: 'OK', data }))
    if (url.pathname.endsWith('/tt_user/oauth2/token/')) return ok({ access_token: 'AT1', refresh_token: 'RT1', expires_in: 86400, open_id: BUSINESS_ID })
    if (url.pathname.endsWith('/business/get/')) return ok({ username: 'nuclick', display_name: 'NuClick' })
    if (url.pathname.endsWith('/business/comment/list/')) {
      return ok({
        comments: [
          { comment_id: '111', text: 'Quanto custa o plano?', user_id: 'u-1', username: 'maria', owner: false, status: 'PUBLIC' },
          { comment_id: '222', text: 'Obrigado pessoal!', user_id: BUSINESS_ID, username: 'nuclick', owner: true, status: 'PUBLIC' },
          { comment_id: '333', text: 'comentário oculto', user_id: 'u-2', username: 'joao', owner: false, status: 'HIDDEN' },
        ],
      })
    }
    if (url.pathname.endsWith('/business/comment/reply/create/')) return ok({ comment_id: '999' })
    res.statusCode = 404
    res.end(JSON.stringify({ code: 40000, message: 'not found' }))
  })
})

async function main() {
  await new Promise<void>((r) => fakeTikTok.listen(0, '127.0.0.1', r))
  const port = (fakeTikTok.address() as AddressInfo).port
  process.env.TIKTOK_API_BASE = `http://127.0.0.1:${port}/open_api/v1.3`
  process.env.TIKTOK_APP_ID = 'app-test'
  process.env.TIKTOK_APP_SECRET = APP_SECRET
  process.env.API_URL = 'https://api.example.test'
  process.env.FRONTEND_URL = 'https://app.example.test'

  // ── Stubs de prisma e fila (tiktok.routes importa os dois) ────────────────
  const queued: any[] = []
  const channelUpdates: any[] = []
  const channel = { id: 'ch-1', type: 'TIKTOK', isActive: true, config: { businessId: BUSINESS_ID, accessToken: 'AT1' } }
  const fakePrisma = {
    channel: {
      findFirst: async ({ where }: any) => (where?.config?.equals === BUSINESS_ID ? channel : null),
      update: async (arg: any) => { channelUpdates.push(arg); return channel },
    },
  }
  const stub = (rel: string, exports: any) => {
    const p = require.resolve(rel)
    require.cache[p] = { id: p, filename: p, loaded: true, exports, children: [], paths: [] } as any
  }
  stub('../src/lib/prisma', { prisma: fakePrisma })
  stub('../src/lib/queue', { messageQueue: { add: async (...a: any[]) => { queued.push(a) } } })

  const tiktok = await import('../src/lib/tiktok')
  const { tiktokRoutes } = await import('../src/modules/integrations/tiktok.routes')
  const Fastify = (await import('fastify')).default
  const rawBody = (await import('fastify-raw-body')).default

  // ── 1. Assinatura ─────────────────────────────────────────────────────────
  console.log('\n1. Assinatura do webhook')
  const body = Buffer.from('{"a":1}')
  const hex = crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex')
  check('formato <hex> válido', tiktok.isValidTikTokSignature(body, hex))
  check('assinatura errada rejeitada', !tiktok.isValidTikTokSignature(body, 'x'.repeat(64)))
  check('sem header rejeitado', !tiktok.isValidTikTokSignature(body, undefined))
  const ts = Math.floor(Date.now() / 1000)
  const sigTs = crypto.createHmac('sha256', APP_SECRET).update(`${ts}.${body.toString()}`).digest('hex')
  check('formato t=,s= válido', tiktok.isValidTikTokSignature(body, `t=${ts},s=${sigTs}`))
  const old = ts - 3600
  const sigOld = crypto.createHmac('sha256', APP_SECRET).update(`${old}.${body.toString()}`).digest('hex')
  check('timestamp antigo rejeitado', !tiktok.isValidTikTokSignature(body, `t=${old},s=${sigOld}`))

  // ── 2. Rota do webhook ────────────────────────────────────────────────────
  console.log('\n2. Rota POST /webhooks/tiktok')
  const app = Fastify()
  await app.register(rawBody, { field: 'rawBody', global: false, runFirst: true })
  await app.register(tiktokRoutes)
  const post = async (payload: any, sign = true) => {
    const raw = JSON.stringify(payload)
    return app.inject({
      method: 'POST',
      url: '/webhooks/tiktok',
      headers: {
        'content-type': 'application/json',
        ...(sign ? { 'tiktok-signature': crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex') } : {}),
      },
      payload: raw,
    })
  }
  const commentEvent = (over: any = {}) => ({
    event: 'comment.update',
    // IDs de 19 dígitos vêm como número dentro da string — testa a preservação de precisão
    content: `{"comment_id":1234567890123456789,"video_id":${VIDEO_ID},"parent_comment_id":0,"business_id":"${BUSINESS_ID}","action":"insert","text":"oi"${over.extra || ''}}`,
    ...over.top,
  })

  let r = await post(commentEvent(), false)
  check('sem assinatura → 403', r.statusCode === 403, r.statusCode)

  r = await post(commentEvent())
  check('comentário novo → 200', r.statusCode === 200, r.statusCode)
  check('enfileirou 1 job', queued.length === 1, queued.length)
  const job = queued[0]?.[1]
  check('job com canal e tipo corretos', job?.channelId === 'ch-1' && job?.channelType === 'TIKTOK', job)
  check('ID de 19 dígitos preservado', job?.payload?.commentId === '1234567890123456789', job?.payload)
  check('jobId evita duplicidade', queued[0]?.[2]?.jobId === 'tiktok-1234567890123456789', queued[0]?.[2])

  const before = queued.length
  await post(commentEvent({ extra: '', top: { content: `{"comment_id":5,"video_id":${VIDEO_ID},"parent_comment_id":42,"business_id":"${BUSINESS_ID}","action":"insert"}` } }))
  check('resposta a comentário (parent≠0) ignorada', queued.length === before)

  await post(commentEvent({ top: { content: `{"comment_id":6,"video_id":${VIDEO_ID},"parent_comment_id":0,"business_id":"${BUSINESS_ID}","action":"delete"}` } }))
  check('comentário apagado ignorado', queued.length === before)

  await post(commentEvent({ top: { content: `{"comment_id":7,"video_id":${VIDEO_ID},"parent_comment_id":0,"business_id":"outra-conta","action":"insert"}` } }))
  check('conta desconhecida ignorada', queued.length === before)

  await post({ event: 'authorization.removed', content: `{"business_id":"${BUSINESS_ID}"}` })
  check('authorization.removed marca needsReconnect', channelUpdates.at(-1)?.data?.config?.needsReconnect === true, channelUpdates)

  // ── 3. Cliente da API (contra o TikTok falso) ─────────────────────────────
  console.log('\n3. Cliente da API TikTok')
  const cfg = { accessToken: 'AT1', businessId: BUSINESS_ID, accessTokenExpiresAt: new Date(Date.now() + 3600e3).toISOString() }
  const c1 = await tiktok.fetchComment('ch-1', cfg, VIDEO_ID, '111')
  check('busca comentário de cliente', c1?.text === 'Quanto custa o plano?' && c1.username === 'maria' && !c1.isOwner && c1.isPublic, c1)
  const c2 = await tiktok.fetchComment('ch-1', cfg, VIDEO_ID, '222')
  check('comentário do próprio dono marcado isOwner (worker ignora)', c2?.isOwner === true, c2)
  const c3 = await tiktok.fetchComment('ch-1', cfg, VIDEO_ID, '333')
  check('comentário oculto marcado não-público (worker ignora)', c3?.isPublic === false, c3)
  check('comentário inexistente → null', (await tiktok.fetchComment('ch-1', cfg, VIDEO_ID, '404')) === null)
  const listCall = apiCalls.find((c) => c.path.endsWith('/business/comment/list/'))
  check('enviou Access-Token no header', listCall?.headers['access-token'] === 'AT1', listCall?.headers)

  await tiktok.replyToComment('ch-1', cfg, VIDEO_ID, '111', 'O plano começa em R$ 99/mês 😊')
  const replyCall = apiCalls.find((c) => c.path.endsWith('/business/comment/reply/create/'))
  check('resposta publicada com os campos certos',
    replyCall?.body?.business_id === BUSINESS_ID && replyCall.body.video_id === VIDEO_ID &&
    replyCall.body.comment_id === '111' && replyCall.body.comment_type === 'REPLY' &&
    replyCall.body.text === 'O plano começa em R$ 99/mês 😊', replyCall?.body)

  const tok = await tiktok.exchangeAuthCode('code-xyz')
  check('troca de código por token', tok.access_token === 'AT1' && tok.open_id === BUSINESS_ID, tok)

  // ── 4. Encurtamento ───────────────────────────────────────────────────────
  console.log('\n4. Respostas curtas (limite 150)')
  const short = tiktok.shortenForTikTok('Olá! Temos planos a partir de R$ 99 por mês.')
  check('texto curto fica intacto', short === 'Olá! Temos planos a partir de R$ 99 por mês.', short)
  const longText = 'Temos vários planos. ' + 'Cada plano inclui atendimento por IA em vários canais com histórico completo e relatórios. '.repeat(5)
  const cut = tiktok.shortenForTikTok(longText)
  check('texto longo ≤ 150 caracteres', cut.length <= 150, cut.length)
  check('corta em fim de frase quando possível', cut.endsWith('.'), cut)
  const noPunct = tiktok.shortenForTikTok('palavra '.repeat(40))
  check('sem pontuação: corta em palavra inteira com reticências', noPunct.length <= 150 && noPunct.endsWith('…') && !/palav…$/.test(noPunct), noPunct)

  await app.close()
  fakeTikTok.close()
  console.log(`\n${passed} ok, ${failed} falhas`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
