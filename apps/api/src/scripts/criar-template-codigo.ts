// Cria o template de Autenticação "codigo_portal" (código de verificação com botão "Copiar código")
// SOMENTE no canal WhatsApp escolhido. Só cadastra o modelo na Meta (não envia mensagem a ninguém).
//
// Uso (no console da API no Easypanel):
//   node dist/scripts/criar-template-codigo.js --canal=99458887             -> só mostra qual canal seria usado
//   node dist/scripts/criar-template-codigo.js --canal=99458887 --executar  -> cria o template
//   --canal=<dígitos>  obrigatório: parte do telefone ou do nome do canal (ex.: 99458887)
//   --nome=codigo_portal  (padrão)
import { prisma } from '../lib/prisma'
import { MetaCloudApiProvider } from '../modules/channels/whatsapp/providers/meta-cloud.provider'

async function main() {
  const executar = process.argv.includes('--executar')
  const canalArg = process.argv.find(a => a.startsWith('--canal='))?.slice(8).replace(/\D/g, '')
  const nome = process.argv.find(a => a.startsWith('--nome='))?.slice(7) ?? 'codigo_portal'
  if (!canalArg || canalArg.length < 6) {
    console.log('Informe --canal=<dígitos do telefone> (mínimo 6), ex.: --canal=99458887')
    process.exit(1)
  }
  if (!/^[a-z0-9_]{1,512}$/.test(nome)) {
    console.log('Nome inválido: só letras minúsculas, números e _')
    process.exit(1)
  }

  const canais = await prisma.channel.findMany({ where: { type: 'WHATSAPP', isActive: true } })
  const alvo = canais.filter(c => `${c.name} ${(c.config as any)?.displayPhoneNumber ?? ''}`.replace(/\D/g, '').includes(canalArg))
  console.log(`${canais.length} canal(is) ativo(s); ${alvo.length} corresponde(m) a "${canalArg}". Modo: ${executar ? 'EXECUTAR' : 'SIMULAÇÃO (use --executar)'}\n`)
  for (const c of alvo) console.log(`- ${c.name} (${c.id}) workspace=${c.workspaceId}`)

  if (alvo.length !== 1) {
    console.log('\nPrecisa corresponder a exatamente 1 canal. Refine o --canal. Nada foi criado.')
    await prisma.$disconnect()
    process.exit(alvo.length === 0 ? 1 : 2)
  }
  if (!executar) { await prisma.$disconnect(); return }

  const c = alvo[0]
  try {
    const r = await new MetaCloudApiProvider().createAuthenticationTemplate(c.id, nome)
    console.log(`\n${nome}: ${r === 'created' ? 'criado (aguardando aprovação da Meta)' : 'já existia'}`)
  } catch (err: any) {
    const e = err?.response?.data?.error
    console.log('\nFALHOU:', e?.error_user_msg || e?.message || err?.message || 'erro desconhecido', e?.code ? `(código ${e.code}/${e.error_subcode ?? '-'})` : '')
    process.exitCode = 1
  }
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
