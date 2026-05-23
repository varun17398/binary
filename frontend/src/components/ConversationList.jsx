import { useEffect, useState } from 'react';
import { fetchConversations, deleteConversation } from '../api';

export default function ConversationList({ activeId, onSelect, onNew, refreshTrigger }) {
  const [conversations, setConversations] = useState([]);

  const load = async () => {
    try {
      const data = await fetchConversations();
      setConversations(data);
    } catch {
      // server may not be ready yet
    }
  };

  useEffect(() => { load(); }, [refreshTrigger]);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    await deleteConversation(id);
    if (activeId === id) onNew();
    load();
  };

  return (
    <nav className="conv-list">
      {conversations.length === 0 && (
        <p className="empty-state">No conversations yet</p>
      )}
      {conversations.map(c => (
        <div
          key={c.id}
          className={`conv-item ${c.id === activeId ? 'active' : ''}`}
          onClick={() => onSelect(c.id)}
        >
          <div className="conv-title">{c.title || 'New conversation'}</div>
          <div className="conv-meta">{c.message_count} msgs</div>
          <button
            className="delete-btn"
            onClick={(e) => handleDelete(e, c.id)}
            title="Delete conversation"
          >
            ×
          </button>
        </div>
      ))}
    </nav>
  );
}
