const express = require('express');
const { requireAuth } = require('../middleware/auth');
const db = require('../lib/db');
const { askAI } = require('../services/aiService');

const router = express.Router();
router.use(requireAuth);

function getOrCreateAIConversation(userId) {
  const found = db.prepare(`
    SELECT c.id
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id
    WHERE c.kind = 'ai' AND cm.user_id = ?
    LIMIT 1
  `).get(userId);

  if (found) return found.id;

  const tx = db.transaction(() => {
    const conv = db.prepare('INSERT INTO conversations (kind) VALUES (?)').run('ai');
    const conversationId = conv.lastInsertRowid;
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(conversationId, userId);
    return conversationId;
  });

  return tx();
}

router.get('/conversation', (req, res) => {
  const conversationId = getOrCreateAIConversation(req.user.id);
  res.json({ conversationId });
});

router.post('/message', async (req, res) => {
  try {
    const { conversationId, prompt } = req.body;
    const convId = Number(conversationId) || getOrCreateAIConversation(req.user.id);

    const member = db.prepare('SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(convId, req.user.id);
    if (!member) return res.status(403).json({ error: 'No tienes acceso a esta conversacion' });
    if (!prompt?.trim()) return res.status(400).json({ error: 'Mensaje obligatorio' });

    const userMsg = db.prepare(`
      INSERT INTO messages (conversation_id, sender_id, message, message_type)
      VALUES (?, ?, ?, 'text')
    `).run(convId, req.user.id, prompt.trim());

    const savedUser = db.prepare('SELECT * FROM messages WHERE id = ?').get(userMsg.lastInsertRowid);

    let aiReply;
    try {
      aiReply = await askAI(prompt.trim());
    } catch (error) {
      console.error('AI message error:', error);
      aiReply = 'No pude responder en este momento. Revisa tu configuracion de OpenAI e intenta de nuevo.';
    }

    const aiMsg = db.prepare(`
      INSERT INTO messages (conversation_id, sender_id, message, message_type)
      VALUES (?, NULL, ?, 'ai')
    `).run(convId, aiReply);

    const savedAi = db.prepare('SELECT * FROM messages WHERE id = ?').get(aiMsg.lastInsertRowid);
    const io = req.app.get('io');
    io.to(`conversation_${convId}`).emit('newMessage', { ...savedUser, sender_name: req.user.name });
    io.to(`conversation_${convId}`).emit('newMessage', { ...savedAi, sender_name: 'Asistente IA' });

    res.json({
      conversationId: convId,
      userMessage: { ...savedUser, sender_name: req.user.name },
      aiMessage: { ...savedAi, sender_name: 'Asistente IA' },
    });
  } catch (error) {
    console.error('AI route error:', error);
    res.status(500).json({ error: 'No se pudo procesar el mensaje de IA' });
  }
});

module.exports = router;
