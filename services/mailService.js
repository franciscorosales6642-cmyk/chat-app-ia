const nodemailer = require('nodemailer');

function buildTransporter() {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  const hasSmtp = required.every((key) => process.env[key]);
  if (!hasSmtp) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendMail({ to, subject, html }) {
  const transporter = buildTransporter();
  if (!transporter) {
    console.log('\n[MAIL NO CONFIGURADO]');
    console.log('Para:', to);
    console.log('Asunto:', subject);
    console.log('Contenido:', html);
    console.log('----------------------\n');
    return { simulated: true };
  }

  return transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
  });
}

async function sendVerificationEmail(to, name, code) {
  return sendMail({
    to,
    subject: 'Verificación de cuenta',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hola ${name}</h2>
        <p>Tu código de verificación es:</p>
        <div style="font-size: 30px; font-weight: bold; letter-spacing: 4px; margin: 20px 0;">${code}</div>
        <p>El código vence en 15 minutos.</p>
      </div>
    `,
  });
}

async function sendResetEmail(to, name, code) {
  return sendMail({
    to,
    subject: 'Recuperación de contraseña',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hola ${name}</h2>
        <p>Usa este código para restablecer tu contraseña:</p>
        <div style="font-size: 30px; font-weight: bold; letter-spacing: 4px; margin: 20px 0;">${code}</div>
        <p>El código vence en 15 minutos.</p>
      </div>
    `,
  });
}

module.exports = {
  sendVerificationEmail,
  sendResetEmail,
};
