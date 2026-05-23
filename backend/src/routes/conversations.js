const express = require('express');
const router = express.Router();
const store = require('../db/conversationStore');

// GET /api/conversations
router.get('/', async (req, res) => {
  try {
    res.json(await store.getAllConversations());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// GET /api/conversations/:id
router.get('/:id', async (req, res) => {
  try {
    const conv = await store.getConversation(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// DELETE /api/conversations/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await store.deleteConversation(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

module.exports = router;
