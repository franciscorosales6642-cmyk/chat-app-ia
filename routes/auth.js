const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../lib/db');
const { generateCode, expiresInMinutes } = require('../lib/helpers');
const { sendVerificationEmail, sendResetEmail } = require('../services/mailService');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, correo y contraseña son obligatorios' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (existing) return res.status(409).json({ error: 'Ese correo ya está registrado' });

    const passwordHash = await bcrypt.hash(password, 10);
    const insert = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
    const result = insert.run(name.trim(), email.trim().toLowerCase(), passwordHash);
    const userId = result.lastInsertRowid;

    const code = generateCode();
    db.prepare('INSERT INTO email_codes (user_id, code, type, expires_at) VALUES (?, ?, ?, ?)')
      .run(userId, code, 'verify', expiresInMinutes(15));

    await sendVerificationEmail(email.trim().toLowerCase(), name.trim(), code);

    res.json({ message: 'Usuario creado. Revisa tu correo para verificar tu cuenta.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

router.post('/verify-email', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Correo y código son obligatorios' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const record = db.prepare(`
    SELECT * FROM email_codes
    WHERE user_id = ? AND code = ? AND type = 'verify' AND used = 0
    ORDER BY id DESC LIMIT 1
  `).get(user.id, code.trim());

  if (!record) return res.status(400).json({ error: 'Código inválido' });
  if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'Código vencido' });

  db.prepare('UPDATE users SET is_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  db.prepare('UPDATE email_codes SET used = 1 WHERE id = ?').run(record.id);

  res.json({ message: 'Cuenta verificada correctamente' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
  if (!user.is_verified) return res.status(403).json({ error: 'Debes verificar tu cuenta antes de iniciar sesión' });

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
      status_text: user.status_text,
      is_verified: !!user.is_verified,
    },
  });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Correo obligatorio' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user) return res.json({ message: 'Si el correo existe, se enviará un código de recuperación.' });

  const code = generateCode();
  db.prepare('INSERT INTO email_codes (user_id, code, type, expires_at) VALUES (?, ?, ?, ?)')
    .run(user.id, code, 'reset', expiresInMinutes(15));
  await sendResetEmail(user.email, user.name, code);

  res.json({ message: 'Si el correo existe, se enviará un código de recuperación.' });
});

router.post('/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'Correo, código y nueva contraseña son obligatorios' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const record = db.prepare(`
    SELECT * FROM email_codes
    WHERE user_id = ? AND code = ? AND type = 'reset' AND used = 0
    ORDER BY id DESC LIMIT 1
  `).get(user.id, code.trim());

  if (!record) return res.status(400).json({ error: 'Código inválido' });
  if (new Date(record.expires_at) < new Date()) return res.status(400).json({ error: 'Código vencido' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passwordHash, user.id);
  db.prepare('UPDATE email_codes SET used = 1 WHERE id = ?').run(record.id);

  res.json({ message: 'Contraseña actualizada correctamente' });
});

module.exports = router;
