import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock resend before importing mailer
vi.mock('resend', () => {
  const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null })
  return {
    Resend: vi.fn(function() {
      this.emails = {
        send: mockSend,
      }
    }),
  }
})

import { sendVerificationEmail, sendPasswordResetEmail } from '../mailer.js'

describe('sendVerificationEmail', () => {
  it('calls resend.emails.send without throwing', async () => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.EMAIL_FROM = 'noreply@test.com'
    process.env.FRONTEND_URL = 'http://localhost:5173'

    await expect(
      sendVerificationEmail('user@example.com', 'Alice', 'abc123tok'),
    ).resolves.not.toThrow()
  })
})

describe('sendPasswordResetEmail', () => {
  it('calls resend.emails.send without throwing', async () => {
    await expect(
      sendPasswordResetEmail('user@example.com', 'Alice', 'reset123tok'),
    ).resolves.not.toThrow()
  })
})
