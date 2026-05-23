export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      <div className="bubble">
        <p>{message.content}</p>
      </div>
    </div>
  );
}
