const express = require('express');
const router = express.Router();
const { getProvider, listProviders } = require('../services/llm');
const { loggedSend } = require('../sdk/inferenceLogger');
const store = require('../db/conversationStore');

router.get('/providers', (req, res) => res.json(listProviders()));

const MAX_CONTEXT_MESSAGES = 20;

// POST /api/chat — send a message, stream the response via SSE
router.post('/', async (req, res) => {
  const { message, conversationId, provider: providerName = 'claude' } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  let conv;
  if (conversationId) {
    conv = await store.getConversation(conversationId);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  } else {
    conv = await store.createConversation();
  }

  // Build context including the new user message before persisting,
  // so we don't need a second DB fetch after addMessage.
  const contextMessages = [
    ...conv.messages.slice(-(MAX_CONTEXT_MESSAGES - 1)),
    { role: 'user', content: message.trim() },
  ].map(m => ({ role: m.role, content: m.content }));

  await store.addMessage(conv.id, 'user', message.trim());

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  send({ type: 'conversation_id', conversationId: conv.id });

  try {
    const provider = getProvider(providerName);
    const stream = await loggedSend(provider, contextMessages, { stream: true, conversationId: conv.id });

    let fullContent = '';
    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        fullContent += chunk.text;
        send({ type: 'text', text: chunk.text });
      }
    }

    await store.addMessage(conv.id, 'assistant', fullContent);
    send({ type: 'done', conversationId: conv.id });
  } catch (err) {
    console.error('LLM error:', err.message);
    send({ type: 'error', error: err.message });
  } finally {
    res.end();
  }
});

module.exports = router;
