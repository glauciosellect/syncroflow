import axios from 'axios'

const SALVY_API_KEY = process.env.SALVY_API_KEY!
const SALVY_BASE_URL = 'https://api.salvy.com.br'

const salvyClient = axios.create({
  baseURL: SALVY_BASE_URL,
  headers: { Authorization: `Bearer ${SALVY_API_KEY}` },
})

function salvyErrorMessage(err: any): string {
  return err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Erro desconhecido na Salvy'
}

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
  try {
    const res = await salvyClient.get('/api/v2/virtual-phone-accounts/area-codes', {
      params: { available: true },
    })
    return res.data.areaCodes.map((a: { areaCode: number }) => a.areaCode)
  } catch (err: any) {
    console.error('[SALVY] Erro ao listar DDDs disponíveis:', err?.response?.data || err?.message)
    throw new Error(salvyErrorMessage(err))
  }
}

export async function createVirtualPhoneAccount(areaCode: number, name?: string): Promise<SalvyVirtualPhoneAccount> {
  try {
    const res = await salvyClient.post('/api/v2/virtual-phone-accounts', { areaCode, name })
    return res.data
  } catch (err: any) {
    console.error('[SALVY] Erro ao provisionar número virtual:', err?.response?.data || err?.message)
    throw new Error(salvyErrorMessage(err))
  }
}

export async function getVirtualPhoneAccount(id: string): Promise<SalvyVirtualPhoneAccount> {
  try {
    const res = await salvyClient.get(`/api/v2/virtual-phone-accounts/${id}`)
    return res.data
  } catch (err: any) {
    console.error(`[SALVY] Erro ao consultar número virtual ${id}:`, err?.response?.data || err?.message)
    throw new Error(salvyErrorMessage(err))
  }
}

export type SalvyCancelReason = 'unnecessary' | 'whatsapp-ban' | 'technical-issues' | 'company-canceled'

export async function cancelVirtualPhoneAccount(id: string, reason: SalvyCancelReason): Promise<void> {
  try {
    await salvyClient.delete(`/api/v2/virtual-phone-accounts/${id}`, { params: { reason } })
  } catch (err: any) {
    console.error(`[SALVY] Erro ao cancelar número virtual ${id}:`, err?.response?.data || err?.message)
    throw new Error(salvyErrorMessage(err))
  }
}
