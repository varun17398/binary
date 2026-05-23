import { useState } from 'react';
import ConversationList from './components/ConversationList';
import ChatWindow from './components/ChatWindow';
import Dashboard from './components/Dashboard';

export default function App() {
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [tab, setTab] = useState('chat');

  const handleNew = () => setActiveConversationId(null);

  const handleConversationStart = (id) => {
    setActiveConversationId(id);
    setRefreshTrigger(n => n + 1);
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="logo">Binary</span>
          <div className="tab-toggle">
            <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
            <button className={tab === 'dash' ? 'active' : ''} onClick={() => setTab('dash')}>Dashboard</button>
          </div>
        </div>

        {tab === 'chat' && (
          <>
            <button className="new-btn" onClick={handleNew}>+ New conversation</button>
            <ConversationList
              activeId={activeConversationId}
              onSelect={setActiveConversationId}
              onNew={handleNew}
              refreshTrigger={refreshTrigger}
            />
          </>
        )}
      </aside>

      <div className="main-area">
        {tab === 'chat' ? (
          <ChatWindow
            conversationId={activeConversationId}
            onConversationStart={handleConversationStart}
          />
        ) : (
          <Dashboard />
        )}
      </div>
    </div>
  );
}
