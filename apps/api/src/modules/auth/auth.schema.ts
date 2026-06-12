import { z } from 'zod'

const strongPassword = z.string()
  .min(8, 'Mínimo 8 caracteres')
  .max(128)
  .refine(p => /[A-Z]/.test(p), 'Deve conter ao menos uma letra maiúscula')
  .refine(p => /[0-9]/.test(p), 'Deve conter ao menos um número')

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: strongPassword,
  workspaceName: z.string().min(2).max(64).optional(),
  phone: z.string().max(20).optional(),
  segment: z.string().max(64).optional(),
  role: z.string().max(64).optional(),
  teamSize: z.string().max(32).optional(),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  totpCode: z.string().optional(),
})

export const refreshSchema = z.object({
  refreshToken: z.string(),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const resetPasswordSchema = z.object({
  token: z.string(),
  password: strongPassword,
})

export const verify2FASchema = z.object({
  totpCode: z.string().length(6),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
