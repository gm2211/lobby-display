/**
 * AssistantPage — /platform/assistant
 *
 * AI assistant chat interface for the platform portal.
 *
 * Features:
 * - Chat message list with alternating user/assistant message bubbles
 * - User messages right-aligned (blue), assistant messages left-aligned (gray)
 * - Input field at bottom with send button
 * - POST messages to /api/platform/assistant/chat with { message, sessionId }
 * - Display assistant response in chat
 * - Session history sidebar: list of past sessions, click to load
 * - "New Chat" button to start fresh session
 * - Loading indicator while waiting for response
 * - Error handling for failed messages
 * - Auto-scroll to bottom on new messages
 */
import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { api } from '../../utils/api';
import { useTheme } from '../../theme/ThemeContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Bot } from 'lucide-react';
import '../styles/tokens.css';

// ---- Types ----

type MessageRole = 'user' | 'assistant';

interface ChatMessage {
  role: MessageRole;
  content: string;
  timestamp: string;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface SessionsResponse {
  sessions: ChatSession[];
}

interface MessagesResponse {
  messages: ChatMessage[];
}

interface ChatResponse {
  sessionId: string;
  message: ChatMessage;
}

// ---- Helpers ----

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ---- MessageBubble ----

interface MessageBubbleProps {
  message: ChatMessage;
  index: number;
}

function MessageBubble({ message, index }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  const rowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: isUser ? 'flex-end' : 'flex-start',
    marginBottom: '12px',
    paddingLeft: isUser ? '64px' : '0',
    paddingRight: isUser ? '0' : '64px',
  };

  const bubbleStyle: CSSProperties = {
    maxWidth: '80%',
    padding: '10px 14px',
    borderRadius: '12px',
    borderTopRightRadius: isUser ? '2px' : '12px',
    borderTopLeftRadius: isUser ? '12px' : '2px',
    fontSize: '14px',
    lineHeight: 1.5,
    color: isUser ? '#ffffff' : 'var(--platform-text-primary)',
    backgroundColor: isUser ? '#1a5fa8' : 'var(--platform-bg-subtle, #f1f5f9)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
    wordBreak: 'break-word',
  };

  const timeStyle: CSSProperties = {
    fontSize: '11px',
    color: isUser ? 'rgba(255,255,255,0.7)' : 'var(--platform-text-muted)',
    marginTop: '4px',
    textAlign: isUser ? 'right' : 'left',
  };

  return (
    <div style={rowStyle} data-testid={`message-bubble-${message.role}-${index}`}>
      <div>
        <div style={bubbleStyle}>{message.content}</div>
        <div style={timeStyle}>{formatTime(message.timestamp)}</div>
      </div>
    </div>
  );
}

// ---- SessionItem ----

interface SessionItemProps {
  session: ChatSession;
  isActive: boolean;
  onClick: () => void;
}

function SessionItem({ session, isActive, onClick }: SessionItemProps) {
  const itemStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '10px 12px',
    fontSize: '13px',
    textAlign: 'left',
    cursor: 'pointer',
    borderRadius: '6px',
    marginBottom: '4px',
    backgroundColor: isActive ? 'rgba(26, 95, 168, 0.1)' : 'transparent',
    color: isActive ? '#1a5fa8' : 'var(--platform-text-primary)',
    fontWeight: isActive ? 600 : 400,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: isActive ? 'rgba(26, 95, 168, 0.3)' : 'transparent',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  return (
    <button style={itemStyle} onClick={onClick}>
      {session.title}
    </button>
  );
}

// ---- Main Component ----

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => generateSessionId());
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const theme = useTheme();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Load sessions on mount
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const data = await api.get<SessionsResponse>('/api/platform/assistant/sessions');
      setSessions(data.sessions ?? []);
    } catch {
      // Sessions load failure is non-blocking
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load a specific session
  const loadSession = useCallback(async (sessionId: string) => {
    setActiveSessionId(sessionId);
    setError(null);
    try {
      const data = await api.get<MessagesResponse>(
        `/api/platform/assistant/sessions/${sessionId}/messages`
      );
      setMessages(data.messages ?? []);
    } catch {
      setMessages([]);
    }
  }, []);

  // Start new chat
  const handleNewChat = useCallback(() => {
    const newId = generateSessionId();
    setActiveSessionId(newId);
    setMessages([]);
    setError(null);
    setInputValue('');
    inputRef.current?.focus();
  }, []);

  // Send a message
  const sendMessage = useCallback(async () => {
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
      const response = await api.post<ChatResponse>('/api/platform/assistant/chat', {
        message: trimmed,
        sessionId: activeSessionId,
      });

      // Update sessionId in case the server assigned one
      if (response.sessionId) {
        setActiveSessionId(response.sessionId);
      }

      if (response.message) {
        setMessages(prev => [...prev, response.message]);
      }

      // Refresh sessions list
      loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, activeSessionId, loadSessions]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ---- Styles ----

  const pageStyle: CSSProperties = {
    display: 'flex',
    height: '100%',
    minHeight: '600px',
    backgroundColor: 'var(--platform-bg-page)',
  };

  const sidebarStyle: CSSProperties = {
    width: '240px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: 'var(--platform-border)',
    backgroundColor: 'var(--platform-surface)',
    padding: '16px',
    overflowY: 'auto',
  };

  const sidebarHeaderStyle: CSSProperties = {
    marginBottom: '12px',
  };

  const sidebarTitleStyle: CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--platform-text-muted)',
    marginBottom: '8px',
  };

  const newChatBtnStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: 'var(--platform-accent)',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '6px',
    cursor: 'pointer',
    marginBottom: '12px',
  };

  const emptySidebarStyle: CSSProperties = {
    fontSize: '12px',
    color: 'var(--platform-text-muted)',
    textAlign: 'center',
    padding: '16px 0',
  };

  const mainStyle: CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--platform-border)',
    backgroundColor: 'var(--platform-surface)',
    flexShrink: 0,
  };

  const titleStyle: CSSProperties = {
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: 0,
  };

  const messagesAreaStyle: CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
  };

  const emptyMessagesStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--platform-text-muted)',
    fontSize: '14px',
    gap: '8px',
  };

  const errorStyle: CSSProperties = {
    margin: '8px 20px',
    padding: '10px 14px',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#fecaca',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#b91c1c',
    flexShrink: 0,
  };

  const inputAreaStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '10px',
    padding: '12px 20px',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--platform-border)',
    backgroundColor: 'var(--platform-surface)',
    flexShrink: 0,
  };

  const textareaStyle: CSSProperties = {
    flex: 1,
    minHeight: '40px',
    maxHeight: '120px',
    padding: '10px 12px',
    fontSize: '14px',
    color: 'var(--platform-text-primary)',
    backgroundColor: 'var(--platform-bg-page)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '8px',
    outline: 'none',
    resize: 'none',
    lineHeight: 1.5,
    fontFamily: 'inherit',
  };

  const sendBtnStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    padding: '0',
    fontSize: '18px',
    color: '#ffffff',
    backgroundColor: isLoading ? 'var(--platform-color-neutral-400, #bfb3a2)' : 'var(--platform-accent)',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '8px',
    cursor: isLoading ? 'not-allowed' : 'pointer',
    flexShrink: 0,
  };

  const dividerStyle: CSSProperties = {
    height: '1px',
    backgroundColor: 'var(--platform-border)',
    margin: '8px 0',
  };

  // ---- Render ----

  return (
    <div style={pageStyle}>
      {/* Sidebar */}
      <aside style={sidebarStyle}>
        <div style={sidebarHeaderStyle}>
          <button style={newChatBtnStyle} onClick={handleNewChat} aria-label="New chat">
            + New Chat
          </button>
          <div style={dividerStyle} />
          <p style={sidebarTitleStyle}>Chat History</p>
        </div>

        {sessionsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
            <LoadingSpinner size="sm" label="Loading sessions..." />
          </div>
        ) : sessions.length === 0 ? (
          <p style={emptySidebarStyle}>No previous chats</p>
        ) : (
          sessions.map(session => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onClick={() => loadSession(session.id)}
            />
          ))
        )}
      </aside>

      {/* Main chat area */}
      <main style={mainStyle}>
        {/* Header */}
        <header style={headerStyle}>
          <h1 style={titleStyle}>AI Assistant</h1>
        </header>

        {/* Messages */}
        <div style={messagesAreaStyle}>
          {messages.length === 0 ? (
            <div style={emptyMessagesStyle}>
              <Bot size={32} color="#1a5c5a" />
              <p>{theme.assistantGreeting}</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} index={i} />
            ))
          )}
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
              <LoadingSpinner size="sm" label="Waiting for response..." />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div style={errorStyle} role="alert">
            {error}
          </div>
        )}

        {/* Input area */}
        <div style={inputAreaStyle}>
          <textarea
            ref={inputRef}
            style={textareaStyle}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isLoading}
            rows={1}
            aria-label="Message input"
          />
          <button
            style={sendBtnStyle}
            onClick={sendMessage}
            disabled={isLoading}
            aria-label="Send"
          >
            ↑
          </button>
        </div>
      </main>
    </div>
  );
}
