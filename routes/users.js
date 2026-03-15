const express = require('express');
const multer = require('multer');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const db = require('../lib/db');
const { uploadsDir } = require('../lib/storage');

const router = express.Router();
router.use(requireAuth);

const uploadStorage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '') || '';
    const safeExtension = extension.replace(/[^.\w-]/g, '').toLowerCase();
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExtension}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

router.post('/upload-avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

  const avatarUrl = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(avatarUrl, req.user.id);

  res.json({ avatar_url: avatarUrl });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

router.put('/me', (req, res) => {
  const { name, status_text } = req.body;
  db.prepare(`
    UPDATE users
    SET name = COALESCE(?, name),
        status_text = COALESCE(?, status_text),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name || null, status_text || null, req.user.id);

  const updated = db.prepare('SELECT id, name, email, avatar_url, status_text, is_verified, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: updated });
});

router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim();
  const users = db.prepare(`
    SELECT id, name, email, avatar_url, status_text
    FROM users
    WHERE id != ? AND (name LIKE ? OR email LIKE ?)
    ORDER BY name ASC
    LIMIT 20
  `).all(req.user.id, `%${q}%`, `%${q}%`);

  res.json({ users });
});

module.exports = router;
