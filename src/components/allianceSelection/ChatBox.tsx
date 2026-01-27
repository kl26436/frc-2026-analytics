import { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import type { ChatMessage } from '../../types/allianceSelection';

interface ChatBoxProps {
  messages: ChatMessage[];
  onSend: (text: string) => Promise<void>;
  myUid: string;
}

function ChatBox({ messages, onSend, myUid }: ChatBoxProps) {
  const [text, setText] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(messages.length);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessageCount.current && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    await onSend(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-2 bg-surfaceElevated hover:bg-interactive transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={14} />
          <span className="text-sm font-bold">Chat</span>
          {messages.length > 0 && (
            <span className="text-xs text-textMuted">({messages.length})</span>
          )}
        </div>
        {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {!collapsed && (
        <>
          {/* Messages */}
          <div ref={messagesContainerRef} className="h-48 overflow-y-auto px-3 py-2 space-y-1.5" style={{ WebkitOverflowScrolling: 'touch' }}>
            {messages.length === 0 && (
              <p className="text-textMuted text-xs text-center py-4">No messages yet</p>
            )}
            {messages.map(msg => {
              const isMe = msg.uid === myUid;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 ${
                    isMe ? 'bg-blueAlliance/20' : 'bg-card'
                  }`}>
                    {!isMe && (
                      <div className="text-[10px] font-semibold text-textSecondary mb-0.5">
                        {msg.displayName}
                        {msg.teamNumber && <span className="text-textMuted ml-1">#{msg.teamNumber}</span>}
                      </div>
                    )}
                    <p className="text-sm break-words">{msg.text}</p>
                  </div>
                  <span className="text-[10px] text-textMuted mt-0.5 px-1">{formatTime(msg.timestamp)}</span>
                </div>
              );
            })}
          </div>

          {/* Input */}
          <div className="border-t border-border px-2 py-2 flex gap-2">
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1 bg-card border border-border rounded px-2.5 py-1.5 text-sm text-textPrimary placeholder-textMuted focus:outline-none focus:border-success"
            />
            <button
              onClick={handleSend}
              disabled={!text.trim()}
              className="p-1.5 rounded bg-blueAlliance text-white hover:bg-blueAlliance/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default ChatBox;
