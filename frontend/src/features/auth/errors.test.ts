import { describe, expect, it } from 'vitest'
import { authMessage } from './errors'

describe('authMessage', () => {
  it.each([
    ['Invalid login credentials', 'The email or password is incorrect.'],
    ['Email not confirmed', 'Please confirm your email first: open the link we sent you, then log in.'],
    ['email rate limit exceeded', 'Too many attempts. Please wait a few minutes and try again.'],
    ['User already registered', 'An account with this email already exists. Try logging in.'],
    ['Failed to fetch', 'Cannot reach the sign-in service. Check your connection and try again.'],
    ['New password should be different from the old password. Same password', 'Choose a password different from your current one.'],
  ])('%s', (raw, expected) => {
    expect(authMessage(new Error(raw))).toBe(expected)
  })
  it('passes unknown messages through and handles non-errors', () => {
    expect(authMessage(new Error('Something specific'))).toBe('Something specific')
    expect(authMessage(undefined)).toBe('Something went wrong. Please try again.')
    expect(authMessage('Invalid login credentials')).toBe('The email or password is incorrect.')
  })
})
