const { v4: uuidv4 } = require('uuid');
const db = require('./index');

async function createConversation() {
  const id = uuidv4();
  const result = await db.query(
    `INSERT INTO conversations (id, title, created_at, updated_at, message_count)
     VALUES ($1, NULL, NOW(), NOW(), 0)
     RETURNING *`,
    [id]
  );
  return { ...result.rows[0], messages: [] };
}

async function getConversation(id) {
  const result = await db.query(
    `SELECT
       c.id, c.title, c.created_at, c.updated_at, c.message_count,
       COALESCE(
         json_agg(
           json_build_object('role', m.role, 'content', m.content, 'timestamp', m.created_at)
           ORDER BY m.created_at ASC
         ) FILTER (WHERE m.id IS NOT NULL),
         '[]'
       ) AS messages
     FROM conversations c
     LEFT JOIN messages m ON m.conversation_id = c.id
     WHERE c.id = $1
     GROUP BY c.id`,
    [id]
  );
  return result.rows[0] || null;
}

async function getAllConversations() {
  const result = await db.query(
    `SELECT
       c.id, c.title, c.created_at, c.updated_at, c.message_count,
       (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS preview
     FROM conversations c
     ORDER BY c.updated_at DESC`
  );
  return result.rows;
}

async function addMessage(conversationId, role, content) {
  await db.query(
    `INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)`,
    [conversationId, role, content]
  );
  await db.query(
    `UPDATE conversations
     SET updated_at = NOW(),
         message_count = message_count + 1,
         title = CASE WHEN title IS NULL AND $2 = 'user' THEN SUBSTRING($3, 1, 60) ELSE title END
     WHERE id = $1`,
    [conversationId, role, content]
  );
}

async function deleteConversation(id) {
  const result = await db.query(
    `DELETE FROM conversations WHERE id = $1`,
    [id]
  );
  return result.rowCount > 0;
}

module.exports = { createConversation, getConversation, getAllConversations, addMessage, deleteConversation };
