import { MetaCloudApiProvider } from './providers/meta-cloud.provider'
import type { WhatsAppProvider } from './provider.interface'

export function getWhatsAppProvider(): WhatsAppProvider {
  return new MetaCloudApiProvider()
}
