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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

function getOrCreateDirectConversation(userA, userB) {
  const found = db.prepare(`
    SELECT c.id
    FROM conversations c
    JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
    JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
    WHERE c.kind = 'direct'
    LIMIT 1
  `).get(userA, userB);

  if (found) return found.id;

  const tx = db.transaction(() => {
    const conv = db.prepare('INSERT INTO conversations (kind) VALUES (?)').run('direct');
    const conversationId = conv.lastInsertRowid;
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(conversationId, userA);
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(conversationId, userB);
    return conversationId;
  });

  return tx();
}

router.get('/conversations', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.kind, c.created_at,
           m.message AS last_message,
           m.created_at AS last_message_at,
           u.id AS other_user_id,
           u.name AS other_user_name,
           u.email AS other_user_email,
           u.avatar_url AS other_user_avatar,
           u.status_text AS other_user_status
    FROM conversations c
    JOIN conversation_members mine ON mine.conversation_id = c.id AND mine.user_id = ?
    LEFT JOIN conversation_members other ON other.conversation_id = c.id AND other.user_id != ?
    LEFT JOIN users u ON u.id = other.user_id
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1
    )
    ORDER BY COALESCE(m.created_at, c.created_at) DESC
  `).all(req.user.id, req.user.id);

  const conversations = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    created_at: row.created_at,
    last_message: row.last_message,
    last_message_at: row.last_message_at,
    title: row.kind === 'ai' ? 'Asistente IA' : (row.other_user_name || 'Chat'),
    other_user: row.kind === 'ai' ? null : {
      id: row.other_user_id,
      name: row.other_user_name,
      email: row.other_user_email,
      avatar_url: row.other_user_avatar,
      status_text: row.other_user_status,
    },
  }));

  res.json({ conversations });
});

router.post('/direct/:userId', (req, res) => {
  const otherUserId = Number(req.params.userId);
  const otherUser = db.prepare('SELECT id FROM users WHERE id = ?').get(otherUserId);
  if (!otherUser) return res.status(404).json({ error: 'Usuario no encontrado' });

  const conversationId = getOrCreateDirectConversation(req.user.id, otherUserId);
  res.json({ conversationId });
});

router.get('/conversations/:id/messages', (req, res) => {
  const conversationId = Number(req.params.id);
  const member = db.prepare('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, req.user.id);
  if (!member) return res.status(403).json({ error: 'No tienes acceso a esta conversacion' });

  const messages = db.prepare(`
    SELECT m.id, m.conversation_id, m.sender_id, m.message, m.message_type, m.file_url,
           m.latitude, m.longitude, m.location_label, m.created_at,
           u.name AS sender_name
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = ?
    ORDER BY m.id ASC
  `).all(conversationId);

  res.json({ messages });
});

router.post('/conversations/:id/messages', (req, res) => {
  const conversationId = Number(req.params.id);
  const { message, latitude, longitude, locationLabel } = req.body;
  const trimmedMessage = message?.trim();
  const hasLocation = latitude !== undefined || longitude !== undefined;

  if (!trimmedMessage && !hasLocation) {
    return res.status(400).json({ error: 'Mensaje obligatorio' });
  }

  const member = db.prepare('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, req.user.id);
  if (!member) return res.status(403).json({ error: 'No tienes acceso a esta conversacion' });

  let parsedLatitude = null;
  let parsedLongitude = null;

  if (hasLocation) {
    parsedLatitude = Number(latitude);
    parsedLongitude = Number(longitude);

    if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
      return res.status(400).json({ error: 'Ubicacion invalida' });
    }
  }

  const storedMessage = hasLocation ? (trimmedMessage || 'Ubicacion compartida') : trimmedMessage;

  const result = db.prepare(`
    INSERT INTO messages (
      conversation_id, sender_id, message, message_type, latitude, longitude, location_label
    )
    VALUES (?, ?, ?, 'text', ?, ?, ?)
  `).run(
    conversationId,
    req.user.id,
    storedMessage,
    parsedLatitude,
    parsedLongitude,
    locationLabel?.trim() || null
  );

  const saved = db.prepare(`
    SELECT m.id, m.conversation_id, m.sender_id, m.message, m.message_type, m.file_url,
           m.latitude, m.longitude, m.location_label, m.created_at,
           u.name AS sender_name
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);

  const io = req.app.get('io');
  io.to(`conversation_${conversationId}`).emit('newMessage', saved);

  res.json({ message: saved });
});

router.post('/conversations/:id/upload', upload.single('file'), (req, res) => {
  const conversationId = Number(req.params.id);
  const member = db.prepare('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, req.user.id);
  if (!member) return res.status(403).json({ error: 'No tienes acceso a esta conversacion' });

  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

  const fileUrl = `/uploads/${req.file.filename}`;
  const message = req.body.message || req.file.originalname;

  const result = db.prepare(`
    INSERT INTO messages (conversation_id, sender_id, message, message_type, file_url)
    VALUES (?, ?, ?, 'file', ?)
  `).run(conversationId, req.user.id, message, fileUrl);

  const saved = db.prepare(`
    SELECT m.id, m.conversation_id, m.sender_id, m.message, m.message_type, m.file_url,
           m.latitude, m.longitude, m.location_label, m.created_at,
           u.name AS sender_name
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.id = ?
  `).get(result.lastInsertRowid);

  const io = req.app.get('io');
  io.to(`conversation_${conversationId}`).emit('newMessage', saved);

  res.json({ message: saved });
});

module.exports = router;
