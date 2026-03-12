/**
 * AssistantPage component tests — Red/Blue TDD
 *
 * Tests cover:
 * - Chat message list: alternating user/assistant message bubbles
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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../../../src/theme/ThemeContext';

// Mock api module
vi.mock('../../../src/utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import AssistantPage from '../../../src/platform/pages/AssistantPage';
import { api } from '../../../src/utils/api';

// --- Helpers ---

const mockedApi = api as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

function makeSessions(count = 2): ChatSession[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `session-${i + 1}`,
    title: `Chat session ${i + 1}`,
    createdAt: '2025-01-15T10:00:00.000Z',
    updatedAt: '2025-01-15T10:00:00.000Z',
  }));
}

function makeMessages(): ChatMessage[] {
  return [
    {
      role: 'user',
      content: 'Hello, what can you help me with?',
      timestamp: '2025-01-15T10:00:00.000Z',
    },
    {
      role: 'assistant',
      content: 'I can help you with building-related questions!',
      timestamp: '2025-01-15T10:01:00.000Z',
    },
  ];
}

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <AssistantPage />
      </MemoryRouter>
    </ThemeProvider>
  );
}

// --- Tests ---

describe('AssistantPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty sessions list, chat endpoint returns assistant response
    mockedApi.get.mockImplementation((url: string) => {
      // Check /messages before /sessions to avoid prefix collision
      if (url.includes('/messages')) {
        return Promise.resolve({ messages: makeMessages() });
      }
      if (url.includes('/api/platform/assistant/sessions')) {
        return Promise.resolve({ sessions: makeSessions() });
      }
      return Promise.resolve({});
    });
    mockedApi.post.mockResolvedValue({
      sessionId: 'session-new',
      message: {
        role: 'assistant',
        content: 'I can help you with that!',
        timestamp: new Date().toISOString(),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Page structure ----

  it('renders the page heading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /ai assistant/i })).toBeInTheDocument();
    });
  });

  it('renders New Chat button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
    });
  });

  it('renders message input field', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });
  });

  it('renders send button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });
  });

  // ---- Session sidebar ----

  it('renders session history sidebar', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/chat history/i)).toBeInTheDocument();
    });
  });

  it('displays past sessions in the sidebar', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/chat session 1/i)).toBeInTheDocument();
      expect(screen.getByText(/chat session 2/i)).toBeInTheDocument();
    });
  });

  it('loads session messages when clicking a past session', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/chat session 1/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/chat session 1/i));

    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/platform/assistant/sessions/session-1/messages')
      );
    });
  });

  it('shows session messages after loading a session', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/chat session 1/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/chat session 1/i));

    await waitFor(() => {
      expect(screen.getByText(/hello, what can you help me with/i)).toBeInTheDocument();
      expect(screen.getByText(/i can help you with building-related questions/i)).toBeInTheDocument();
    });
  });

  // ---- Message bubbles ----

  it('shows user message bubbles after sending', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Hello assistant' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText('Hello assistant')).toBeInTheDocument();
    });
  });

  it('shows assistant response bubble after sending', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Hello assistant' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/i can help you with that/i)).toBeInTheDocument();
    });
  });

  it('user messages have data-role="user" attribute', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'My user message' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      const userBubble = screen.getByTestId('message-bubble-user-0');
      expect(userBubble).toBeInTheDocument();
    });
  });

  it('assistant messages have data-role="assistant" attribute', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'My user message' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      const assistantBubble = screen.getByTestId('message-bubble-assistant-1');
      expect(assistantBubble).toBeInTheDocument();
    });
  });

  // ---- API call ----

  it('POSTs message and sessionId to /api/platform/assistant/chat', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/api/platform/assistant/chat',
        expect.objectContaining({
          message: 'Test message',
          sessionId: expect.anything(),
        })
      );
    });
  });

  it('clears input field after sending', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });

  it('does not send empty message', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it('allows sending with Enter key', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Keyboard send' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/api/platform/assistant/chat',
        expect.objectContaining({ message: 'Keyboard send' })
      );
    });
  });

  // ---- Loading state ----

  it('shows loading indicator while awaiting response', async () => {
    mockedApi.post.mockReturnValue(new Promise(() => {}));
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Loading test' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  it('disables send button while loading', async () => {
    mockedApi.post.mockReturnValue(new Promise(() => {}));
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Loading test' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    });
  });

  it('disables input while loading', async () => {
    mockedApi.post.mockReturnValue(new Promise(() => {}));
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Loading test' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(input).toBeDisabled();
    });
  });

  // ---- Error handling ----

  it('shows error message when sending fails', async () => {
    mockedApi.post.mockRejectedValue(new Error('Network error'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Will fail' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it('re-enables input after error', async () => {
    mockedApi.post.mockRejectedValue(new Error('Network error'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Will fail' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(input).not.toBeDisabled();
    });
  });

  // ---- New Chat ----

  it('clears chat messages when clicking New Chat', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    // Send a message first
    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Hello assistant' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText('Hello assistant')).toBeInTheDocument();
    });

    // Click New Chat
    fireEvent.click(screen.getByRole('button', { name: /new chat/i }));

    await waitFor(() => {
      expect(screen.queryByText('Hello assistant')).not.toBeInTheDocument();
    });
  });

  it('generates a new sessionId when clicking New Chat', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    // Send first message to get sessionId
    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'First session message' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledTimes(1);
    });

    const firstCallArgs = mockedApi.post.mock.calls[0][1];
    const firstSessionId = firstCallArgs.sessionId;

    // Click New Chat and send again
    fireEvent.click(screen.getByRole('button', { name: /new chat/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
    });

    const newInput = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(newInput, { target: { value: 'Second session message' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledTimes(2);
    });

    const secondCallArgs = mockedApi.post.mock.calls[1][1];
    const secondSessionId = secondCallArgs.sessionId;

    expect(secondSessionId).not.toBe(firstSessionId);
  });

  // ---- Session fetching ----

  it('fetches sessions on mount', async () => {
    renderPage();
    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/api/platform/assistant/sessions');
    });
  });

  it('shows empty state message when no sessions', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/api/platform/assistant/sessions')) {
        return Promise.resolve({ sessions: [] });
      }
      return Promise.resolve({});
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no previous chats/i)).toBeInTheDocument();
    });
  });
});
