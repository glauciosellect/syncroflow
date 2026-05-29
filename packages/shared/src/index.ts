// Tipos compartilhados entre frontend e backend

export type Plan = 'TRIAL' | 'BASIC' | 'STANDARD' | 'CORPORATE' | 'ENTERPRISE'
export type MemberRole = 'OWNER' | 'ADMIN' | 'AGENT'
export type AgentPurpose = 'SUPPORT' | 'SALES' | 'PERSONAL'
export type CommunicationStyle = 'FORMAL' | 'NORMAL' | 'CASUAL'
export type TrainingType = 'TEXT' | 'WEBSITE' | 'VIDEO' | 'DOCUMENT'
export type TrainingStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'ERROR'
export type ChannelType = 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'TELEGRAM' | 'WIDGET' | 'EMAIL' | 'SMS'
export type ConversationStatus = 'AI_ACTIVE' | 'WAITING_HUMAN' | 'HUMAN_ACTIVE' | 'CLOSED'
export type MessageRole = 'USER' | 'ASSISTANT' | 'HUMAN' | 'SYSTEM'
export type IntentionResponseMode = 'INTERPRET_API' | 'FIXED_MESSAGE' | 'API_RAW'
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL'

export interface User {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  language: string
  theme: string
  twoFactorEnabled: boolean
  onboardingDone: boolean
  createdAt: string
}

export interface Workspace {
  id: string
  name: string
  slug: string
  plan: Plan
  credits: number
  trialEndsAt: string | null
  createdAt: string
}

export interface Agent {
  id: string
  name: string
  avatarUrl: string | null
  purpose: AgentPurpose
  companyName: string | null
  companyWebsite: string | null
  companyDesc: string | null
  behavior: string | null
  communicationStyle: CommunicationStyle
  llmModel: string
  workspaceId: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Intention {
  id: string
  agentId: string
  name: string
  description: string | null
  fields: unknown | null
  actionType: 'WEBHOOK' | 'INTERNAL'
  webhookUrl: string | null
  webhookMethod: string
  webhookHeaders: unknown | null
  webhookParams: unknown | null
  webhookBody: unknown | null
  outputVariables: unknown | null
  responseMode: IntentionResponseMode
  isActive: boolean
}

export const LLM_MODELS = [
  { id: 'claude-3-5-haiku-20241022', name: 'Claude Haiku', creditRate: 1 },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude Sonnet', creditRate: 3 },
  { id: 'claude-opus-4-5', name: 'Claude Opus', creditRate: 10 },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', creditRate: 1 },
  { id: 'gpt-4o', name: 'GPT-4o', creditRate: 5 },
] as const

export const PLAN_CREDITS: Record<Plan, number> = {
  TRIAL: 1000, BASIC: 2500, STANDARD: 11500, CORPORATE: 30000, ENTERPRISE: 100000,
}
