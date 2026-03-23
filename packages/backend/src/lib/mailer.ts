import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
): Promise<void> {
  const url = `${process.env.FRONTEND_URL}/verify-email?token=${token}`
  const resend = getResend()
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'noreply@continental.app',
    to,
    subject: 'Verify your Continental account',
    text: `Hi ${name},\n\nVerify your email here: ${url}\n\nLink expires in 24 hours.`,
    html: `<p>Hi ${name},</p><p><a href="${url}">Verify your email</a></p><p>Link expires in 24 hours.</p>`,
  })
}

export async function sendInvitationEmail(
  to: string,
  playerName: string,
  groupName: string,
  token: string,
): Promise<void> {
  const url = `${process.env.FRONTEND_URL}/join?token=${token}`
  const resend = getResend()
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'noreply@continental.app',
    to,
    subject: `You've been invited to join ${groupName} on Continental`,
    text: `Hi ${playerName},\n\nYou've been invited to join ${groupName}.\n\nAccept your invitation: ${url}\n\nLink expires in 7 days.`,
    html: `<p>Hi ${playerName},</p><p>You've been invited to join <strong>${groupName}</strong>.</p><p><a href="${url}">Accept invitation</a></p><p>Link expires in 7 days.</p>`,
  })
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
): Promise<void> {
  const url = `${process.env.FRONTEND_URL}/reset-password?token=${token}`
  const resend = getResend()
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'noreply@continental.app',
    to,
    subject: 'Reset your Continental password',
    text: `Hi ${name},\n\nReset your password here: ${url}\n\nLink expires in 1 hour.`,
    html: `<p>Hi ${name},</p><p><a href="${url}">Reset your password</a></p><p>Link expires in 1 hour.</p>`,
  })
}
