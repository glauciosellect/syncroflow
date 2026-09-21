import geoip from 'geoip-lite'

export type GeoInfo = { city: string | null; region: string | null; country: string | null }

// Resolve geolocalização aproximada (cidade/região/país) a partir de um IP
// usando uma base local (sem chamada externa) — não funciona para IPs
// privados/localhost, comuns em ambiente de desenvolvimento.
export function lookupGeo(ipAddress?: string | null): GeoInfo | null {
  if (!ipAddress) return null
  const ip = ipAddress.split(',')[0].trim().replace(/^::ffff:/, '')
  try {
    const result = geoip.lookup(ip)
    if (!result) return null
    return {
      city: result.city || null,
      region: result.region || null,
      country: result.country || null,
    }
  } catch {
    return null
  }
}
