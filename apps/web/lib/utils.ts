import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(date: string | Date) {
  return new Date(date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export function channelLabel(type: string) {
  const map: Record<string, string> = {
    WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook',
    TELEGRAM: 'Telegram', WIDGET: 'Widget', EMAIL: 'Email', SMS: 'SMS',
  }
  return map[type] || type
}

export function planLabel(plan: string) {
  const map: Record<string, string> = { TRIAL: 'Trial', BASIC: 'Basic', STANDARD: 'Standard', CORPORATE: 'Corporate', ENTERPRISE: 'Enterprise' }
  return map[plan] || plan
}
