import { useEffect, useRef, useState } from 'react';
import MessageBubble from './MessageBubble';
import { streamChat, fetchConversation } from '../api';

const PROVIDERS = [
  { value: 'claude', label: 'Claude (Anthropic)' },
  { value: 'openai', label: 'GPT-4o mini (OpenAI)' },
];

export default function ChatWindow({ conversationId, onConversationStart }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [provider, setProvider] = useState('claude');
  const bottomRef = useRef(null);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    fetchConversation(conversationId)
      .then(conv => setMessages(conv.messages || []))
      .catch(() => setMessages([]));
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    setStreaming(true);
    setStreamingText('');
    abortRef.current = false;

    setMessages(prev => [...prev, { role: 'user', content: text }]);

    let activeConvId = conversationId;
    let assistantText = '';

    await streamChat({
      message: text,
      conversationId: activeConvId,
      provider,
      onChunk: (chunk) => {
        if (abortRef.current) return;
        if (chunk.type === 'conversation_id') {
          activeConvId = chunk.conversationId;
          if (!conversationId) onConversationStart(activeConvId);
        } else if (chunk.type === 'text') {
          assistantText += chunk.text;
          setStreamingText(assistantText);
        }
      },
      onDone: () => {
        setMessages(prev => [...prev, { role: 'assistant', content: assistantText }]);
        setStreamingText('');
        setStreaming(false);
      },
      onError: (err) => {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err}` }]);
        setStreamingText('');
        setStreaming(false);
      },
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const cancel = () => {
    abortRef.current = true;
    setStreamingText('');
    setStreaming(false);
  };

  return (
    <main className="chat-window">
      <div className="messages">
        {messages.length === 0 && !streaming && (
          <div className="welcome"><h2>What can I help you with?</h2></div>
        )}
        {messages.map((m, i) => <MessageBubble key={i} message={m} />)}
        {streamingText && <MessageBubble message={{ role: 'assistant', content: streamingText }} />}
        <div ref={bottomRef} />
      </div>

      <div className="input-area">
        {streaming && (
          <button className="cancel-btn" onClick={cancel}>Stop generating</button>
        )}
        <div className="input-row">
          <select
            className="provider-select"
            value={provider}
            onChange={e => setProvider(e.target.value)}
            disabled={streaming}
          >
            {PROVIDERS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Binary..."
            rows={1}
            disabled={streaming}
          />
          <button className="send-btn" onClick={send} disabled={!input.trim() || streaming}>
            Send
          </button>
        </div>
      </div>
    </main>
  );
}
