import { EvolutionApiProvider } from './providers/evolution.provider'
import { ZApiProvider } from './providers/zapi.provider'
import { UazApiProvider } from './providers/uazapi.provider'
import { MetaCloudApiProvider } from './providers/meta-cloud.provider'
import type { WhatsAppProvider } from './provider.interface'

export function getWhatsAppProvider(): WhatsAppProvider {
  const provider = process.env.WHATSAPP_PROVIDER || 'uazapi'
  switch (provider) {
    case 'zapi': return new ZApiProvider()
    case 'evolution': return new EvolutionApiProvider()
    case 'uazapi': return new UazApiProvider()
    case 'meta-cloud': return new MetaCloudApiProvider()
    default: throw new Error(`Provider WhatsApp desconhecido: "${provider}"`)
  }
}
