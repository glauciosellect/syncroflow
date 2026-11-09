// Cria o template padrão "retomar_conversa" em todos os canais WhatsApp ativos.
// Só cadastra o modelo na Meta (não envia mensagem a nenhum cliente).
//
// Uso (no console da API no Easypanel):
//   node dist/scripts/criar-template-padrao.js              -> só LISTA os canais (nada é criado)
//   node dist/scripts/criar-template-padrao.js --executar   -> cria o template em cada canal
//   --ignorar=98202232   -> pula canais cujo nome/telefone contém esses dígitos (pode repetir)
import { prisma } from '../lib/prisma'
import { MetaCloudApiProvider } from '../modules/channels/whatsapp/providers/meta-cloud.provider'

async function main() {
  const executar = process.argv.includes('--executar')
  const ignorar = process.argv.filter(a => a.startsWith('--ignorar=')).map(a => a.slice(10).replace(/D/g, '')).filter(Boolean)
  const canais = await prisma.channel.findMany({ where: { type: 'WHATSAPP', isActive: true } })
  console.log(`${canais.length} canal(is) WhatsApp ativo(s). Modo: ${executar ? 'EXECUTAR' : 'SIMULAÇÃO (use --executar para criar)'}\n`)

  const provider = new MetaCloudApiProvider()
  const falhas: string[] = []
  let criados = 0, existentes = 0, semConfig = 0

  for (const c of canais) {
    const cfg = c.config as any
    const rotulo = `${c.name} (${c.id})`
    const digitos = `${c.name} ${cfg?.displayPhoneNumber ?? ''}`.replace(/D/g, '')
    if (ignorar.some(d => digitos.includes(d))) { console.log(`- ${rotulo}: IGNORADO (--ignorar), nada foi feito`); continue }
    if (!cfg?.wabaId || !cfg?.accessToken) { semConfig++; console.log(`- ${rotulo}: sem wabaId/token, ignorado`); continue }
    if (!executar) { console.log(`- ${rotulo}: receberia o template`); continue }
    try {
      const r = await provider.createDefaultTemplate(c.id)
      if (r === 'created') criados++; else existentes++
      console.log(`- ${rotulo}: ${r === 'created' ? 'criado (aguardando aprovação)' : 'já existia'}`)
    } catch (err: any) {
      const motivo = err?.response?.data?.error?.error_user_msg || err?.response?.data?.error?.message || err?.message || 'erro desconhecido'
      falhas.push(`${rotulo}: ${motivo}`)
      console.log(`- ${rotulo}: FALHOU: ${motivo}`)
    }
  }

  if (executar) console.log(`\nResumo: ${criados} criado(s), ${existentes} já existia(m), ${semConfig} sem configuração, ${falhas.length} falha(s).`)
  if (falhas.length) console.log('\nCanais para tratar (token vencido ou sem permissão):\n' + falhas.map(f => ` * ${f}`).join('\n'))
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
