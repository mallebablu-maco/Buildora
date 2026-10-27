import { z } from 'zod'
import { LIMITS } from '@/lib/limits'

export const PERSONAS = [
  { value: 'homeowner', title: 'Homeowner', description: 'Planning my own build' },
  { value: 'contractor', title: 'Contractor', description: 'Quoting and buying for sites' },
  { value: 'engineer', title: 'Engineer', description: 'Checking and reviewing' },
  { value: 'student', title: 'Student', description: 'Learning estimation' },
] as const

export type Persona = (typeof PERSONAS)[number]['value']

const email = z.string().trim().min(1, 'Enter your email.').email('Enter a valid email address.')
// Supabase enforces its own minimum; 8 matches the design. The upper bound avoids pointless huge payloads.
const newPassword = z.string().min(8, 'Use 8 or more characters.').max(72, 'Use at most 72 characters.')

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
  keep: z.boolean(),
})
export type LoginValues = z.infer<typeof loginSchema>

export const signupSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name.').max(LIMITS.PERSON_NAME, `Use at most ${LIMITS.PERSON_NAME} characters.`),
  email,
  password: newPassword,
  persona: z.enum(['homeowner', 'contractor', 'engineer', 'student']),
  acceptDisclaimer: z.boolean().refine((v) => v, 'Please confirm that you understand this.'),
})
export type SignupValues = z.infer<typeof signupSchema>

export const forgotSchema = z.object({ email })
export type ForgotValues = z.infer<typeof forgotSchema>

export const resetSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'The passwords do not match.', path: ['confirm'] })
export type ResetValues = z.infer<typeof resetSchema>
