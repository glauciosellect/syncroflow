import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendEmail(to: string, subject: string, html: string) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@syncroflow.com',
    to,
    subject,
    html,
  })
}

export function workspaceInviteEmail(inviterName: string, workspaceName: string, role: string, acceptUrl: string): string {
  const roleLabel = role === 'ADMIN' ? 'Administrador' : 'Agente'
  return `
    <h2>Você foi convidado!</h2>
    <p><strong>${inviterName}</strong> convidou você para participar do workspace <strong>${workspaceName}</strong> como <strong>${roleLabel}</strong>.</p>
    <p>Clique no botão abaixo para aceitar o convite:</p>
    <a href="${acceptUrl}" style="background:#1565C0;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">
      Aceitar Convite
    </a>
    <p>Este convite expira em 7 dias. Se você não esperava este convite, pode ignorar este email.</p>
  `
}

export function passwordResetEmail(name: string, resetUrl: string): string {
  return `
    <h2>Olá, ${name}!</h2>
    <p>Você solicitou a redefinição de senha. Clique no link abaixo para criar uma nova senha:</p>
    <a href="${resetUrl}" style="background:#6366f1;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">
      Redefinir Senha
    </a>
    <p>Este link expira em 1 hora. Se você não solicitou, ignore este email.</p>
  `
}
