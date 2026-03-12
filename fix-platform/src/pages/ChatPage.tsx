/**
 * ChatPage — /chat (admin-only)
 *
 * Simple chat interface that proxies messages to the renzo-ai server
 * via POST /api/chat. Supports two modes:
 * - "local": keyword-based engine with MCP tool calls (no LLM needed)
 * - "groq": Groq LLM with MCP context injection (requires GROQ_API_KEY)
 */
import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { api } from '../utils/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatResponse {
  message: ChatMessage;
  error?: string;
}

type ChatMode = 'local' | 'groq';

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>('local');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setError(null);
    setIsLoading(true);

    try {
      // Build history for Groq mode (last 10 messages)
      const history = mode === 'groq'
        ? messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
        : undefined;

      const response = await api.post<ChatResponse>('/api/chat', {
        message: trimmed,
        mode,
        history,
      });
      if (response.message) {
        setMessages(prev => [...prev, response.message]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const pageStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxWidth: '800px',
    margin: '0 auto',
    backgroundColor: '#fff',
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    flexShrink: 0,
  };

  const toggleStyle = (isActive: boolean): CSSProperties => ({
    padding: '4px 12px',
    fontSize: '12px',
    fontWeight: isActive ? 700 : 400,
    color: isActive ? '#fff' : '#374151',
    backgroundColor: isActive ? '#1a5fa8' : '#e5e7eb',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '4px',
    cursor: 'pointer',
  });

  const messagesAreaStyle: CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
  };

  const inputAreaStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '10px',
    padding: '12px 20px',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    flexShrink: 0,
  };

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#111827' }}>
            AI Chat
          </h1>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>Admin</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#6b7280', marginRight: '4px' }}>Engine:</span>
          <button style={toggleStyle(mode === 'local')} onClick={() => setMode('local')}>
            Local (MCP)
          </button>
          <button style={toggleStyle(mode === 'groq')} onClick={() => setMode('groq')}>
            Groq LLM
          </button>
          <button
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              color: '#6b7280',
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: '#d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              marginLeft: '8px',
            }}
            onClick={clearChat}
          >
            Clear
          </button>
        </div>
      </header>

      <div style={messagesAreaStyle}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: '60px 20px' }}>
            <p style={{ fontSize: '16px', marginBottom: '8px' }}>Ask me about the building!</p>
            <p style={{ fontSize: '13px', marginBottom: '16px' }}>
              Try: "When is the grill available?" or "Any announcements?" or "What amenities are there?"
            </p>
            <p style={{ fontSize: '11px', color: '#d1d5db' }}>
              Mode: {mode === 'groq' ? 'Groq LLM (Llama 3.1 8B) with MCP context' : 'Local keyword engine with MCP tool calls'}
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                marginBottom: '12px',
              }}
            >
              <div
                style={{
                  maxWidth: '75%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  borderTopRightRadius: isUser ? '2px' : '12px',
                  borderTopLeftRadius: isUser ? '12px' : '2px',
                  fontSize: '14px',
                  lineHeight: 1.6,
                  color: isUser ? '#fff' : '#111827',
                  backgroundColor: isUser ? '#1a5fa8' : '#f3f4f6',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
            <div style={{
              padding: '10px 14px',
              borderRadius: '12px',
              borderTopLeftRadius: '2px',
              backgroundColor: '#f3f4f6',
              color: '#6b7280',
              fontSize: '14px',
            }}>
              {mode === 'groq' ? 'Thinking (Groq)...' : 'Processing...'}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div style={{
          margin: '0 20px 8px',
          padding: '8px 12px',
          backgroundColor: '#fef2f2',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#fecaca',
          borderRadius: '6px',
          fontSize: '13px',
          color: '#b91c1c',
        }}>
          {error}
        </div>
      )}

      <div style={inputAreaStyle}>
        <textarea
          ref={inputRef}
          style={{
            flex: 1,
            minHeight: '40px',
            maxHeight: '120px',
            padding: '10px 12px',
            fontSize: '14px',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: '#d1d5db',
            borderRadius: '8px',
            outline: 'none',
            resize: 'none',
            lineHeight: 1.5,
            fontFamily: 'inherit',
          }}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about amenities, bookings, events..."
          disabled={isLoading}
          rows={1}
        />
        <button
          style={{
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            color: '#fff',
            backgroundColor: isLoading ? '#9ca3af' : '#1a5fa8',
            borderWidth: 0,
            borderStyle: 'solid',
            borderColor: 'transparent',
            borderRadius: '8px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
          onClick={sendMessage}
          disabled={isLoading}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
