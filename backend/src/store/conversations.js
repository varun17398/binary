const { v4: uuidv4 } = require('uuid');

const conversations = new Map();

function createConversation() {
  const id = uuidv4();
  const conv = { id, messages: [], createdAt: new Date(), updatedAt: new Date() };
  conversations.set(id, conv);
  return conv;
}

function getConversation(id) {
  return conversations.get(id) || null;
}

function getAllConversations() {
  return Array.from(conversations.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(c => ({
      id: c.id,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c.messages.length,
      title: c.messages.length > 0 ? c.messages[0].content.slice(0, 60) : 'New conversation',
      preview: c.messages.length > 0 ? c.messages[c.messages.length - 1].content.slice(0, 100) : '',
    }));
}

function addMessage(id, role, content) {
  const conv = conversations.get(id);
  if (!conv) return null;
  conv.messages.push({ role, content, timestamp: new Date() });
  conv.updatedAt = new Date();
  return conv;
}

function deleteConversation(id) {
  return conversations.delete(id);
}

module.exports = { createConversation, getConversation, getAllConversations, addMessage, deleteConversation };
