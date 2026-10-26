import { describe, expect, it } from 'vitest'
import { forgotSchema, loginSchema, resetSchema, signupSchema } from './schemas'

const validSignup = { fullName: 'Asha Rao', email: 'asha@example.com', password: 'longenough', persona: 'engineer', acceptDisclaimer: true }

describe('signupSchema', () => {
  it('accepts a complete form', () => {
    expect(signupSchema.safeParse(validSignup).success).toBe(true)
  })
  it('requires the disclaimer to be ticked', () => {
    const r = signupSchema.safeParse({ ...validSignup, acceptDisclaimer: false })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0].path).toEqual(['acceptDisclaimer'])
  })
  it('requires 8 or more characters in the password', () => {
    expect(signupSchema.safeParse({ ...validSignup, password: '1234567' }).success).toBe(false)
    expect(signupSchema.safeParse({ ...validSignup, password: '12345678' }).success).toBe(true)
  })
  it('rejects a bad email and an empty name', () => {
    expect(signupSchema.safeParse({ ...validSignup, email: 'nope' }).success).toBe(false)
    expect(signupSchema.safeParse({ ...validSignup, fullName: '   ' }).success).toBe(false)
  })
  it('only allows the four personas from the design', () => {
    for (const persona of ['homeowner', 'contractor', 'engineer', 'student']) expect(signupSchema.safeParse({ ...validSignup, persona }).success).toBe(true)
    expect(signupSchema.safeParse({ ...validSignup, persona: 'admin' }).success).toBe(false)
  })
})

describe('other schemas', () => {
  it('login needs an email and a password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x', keep: true }).success).toBe(true)
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '', keep: true }).success).toBe(false)
  })
  it('forgot-password needs a valid email', () => {
    expect(forgotSchema.safeParse({ email: 'a@b.co' }).success).toBe(true)
    expect(forgotSchema.safeParse({ email: 'a@b' }).success).toBe(false)
  })
  it('reset needs matching passwords of 8+ characters', () => {
    expect(resetSchema.safeParse({ password: 'longenough', confirm: 'longenough' }).success).toBe(true)
    const mismatch = resetSchema.safeParse({ password: 'longenough', confirm: 'different!' })
    expect(mismatch.success).toBe(false)
    expect(mismatch.error?.issues[0].path).toEqual(['confirm'])
    expect(resetSchema.safeParse({ password: 'short', confirm: 'short' }).success).toBe(false)
  })
})
