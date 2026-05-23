const BASE = '/api';

export async function streamChat({ message, conversationId, provider = 'claude', onChunk, onDone, onError }) {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, conversationId, provider }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    onError(err.error || 'Request failed');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'conversation_id') onChunk({ type: 'conversation_id', conversationId: data.conversationId });
        else if (data.type === 'text') onChunk({ type: 'text', text: data.text });
        else if (data.type === 'done') onDone(data.conversationId);
        else if (data.type === 'error') onError(data.error);
      } catch {
        // skip malformed lines
      }
    }
  }
}

export async function fetchConversations() {
  const res = await fetch(`${BASE}/conversations`);
  return res.json();
}

export async function fetchConversation(id) {
  const res = await fetch(`${BASE}/conversations/${id}`);
  return res.json();
}

export async function deleteConversation(id) {
  const res = await fetch(`${BASE}/conversations/${id}`, { method: 'DELETE' });
  return res.json();
}
