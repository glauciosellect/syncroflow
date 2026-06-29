import axios from 'axios'

const SALVY_API_KEY = process.env.SALVY_API_KEY!
const SALVY_BASE_URL = 'https://api.salvy.com.br'

const salvyClient = axios.create({
  baseURL: SALVY_BASE_URL,
  headers: { Authorization: `Bearer ${SALVY_API_KEY}` },
})

export type SalvyVirtualPhoneStatus = 'pending' | 'active' | 'blocked' | 'canceled'

export interface SalvyVirtualPhoneAccount {
  id: string
  name: string | null
  phoneNumber: string
  status: SalvyVirtualPhoneStatus
  createdAt: string
  canceledAt: string | null
  cancelReason: string | null
}

export async function listAvailableAreaCodes(): Promise<number[]> {
  const res = await salvyClient.get('/api/v2/virtual-phone-accounts/area-codes', {
    params: { available: true },
  })
  return res.data.areaCodes.map((a: { areaCode: number }) => a.areaCode)
}

export async function createVirtualPhoneAccount(areaCode: number, name?: string): Promise<SalvyVirtualPhoneAccount> {
  const res = await salvyClient.post('/api/v2/virtual-phone-accounts', { areaCode, name })
  return res.data
}

export async function getVirtualPhoneAccount(id: string): Promise<SalvyVirtualPhoneAccount> {
  const res = await salvyClient.get(`/api/v2/virtual-phone-accounts/${id}`)
  return res.data
}

export type SalvyCancelReason = 'unnecessary' | 'whatsapp-ban' | 'technical-issues' | 'company-canceled'

export async function cancelVirtualPhoneAccount(id: string, reason: SalvyCancelReason): Promise<void> {
  await salvyClient.delete(`/api/v2/virtual-phone-accounts/${id}`, { params: { reason } })
}
