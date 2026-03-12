/**
 * Unit tests for LLM Provider service.
 *
 * Tests the LLMProvider interface contract and MockLLMProvider implementation.
 * Tests the getLLMProvider factory function.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockLLMProvider, getLLMProvider } from '../../server/services/llmProvider.js';
import type { ChatMessage } from '../../server/services/llmProvider.js';

// ─── MockLLMProvider ──────────────────────────────────────────────────────────

describe('MockLLMProvider', () => {
  it('returns a non-empty string response', async () => {
    const provider = new MockLLMProvider();
    const messages: ChatMessage[] = [
      { role: 'USER', content: 'Hello, how are you?' },
    ];
    const response = await provider.generateResponse(messages);
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
  });

  it('returns a response for an empty messages array', async () => {
    const provider = new MockLLMProvider();
    const response = await provider.generateResponse([]);
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
  });

  it('returns a response when context is provided', async () => {
    const provider = new MockLLMProvider();
    const messages: ChatMessage[] = [
      { role: 'USER', content: 'What amenities do you have?' },
    ];
    const response = await provider.generateResponse(messages, 'Building has a gym and pool.');
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
  });

  it('handles multi-turn conversation', async () => {
    const provider = new MockLLMProvider();
    const messages: ChatMessage[] = [
      { role: 'USER', content: 'Hello' },
      { role: 'ASSISTANT', content: 'Hi there!' },
      { role: 'USER', content: 'How do I book a room?' },
    ];
    const response = await provider.generateResponse(messages);
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
  });

  it('handles SYSTEM role messages', async () => {
    const provider = new MockLLMProvider();
    const messages: ChatMessage[] = [
      { role: 'SYSTEM', content: 'You are a helpful building assistant.' },
      { role: 'USER', content: 'Hello' },
    ];
    const response = await provider.generateResponse(messages);
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
  });
});

// ─── getLLMProvider factory ───────────────────────────────────────────────────

describe('getLLMProvider', () => {
  const originalEnv = process.env.LLM_PROVIDER;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.LLM_PROVIDER;
    } else {
      process.env.LLM_PROVIDER = originalEnv;
    }
  });

  it('returns MockLLMProvider when LLM_PROVIDER is not set', () => {
    delete process.env.LLM_PROVIDER;
    const provider = getLLMProvider();
    expect(provider).toBeInstanceOf(MockLLMProvider);
  });

  it('returns MockLLMProvider when LLM_PROVIDER is "mock"', () => {
    process.env.LLM_PROVIDER = 'mock';
    const provider = getLLMProvider();
    expect(provider).toBeInstanceOf(MockLLMProvider);
  });

  it('returned provider satisfies LLMProvider interface', async () => {
    delete process.env.LLM_PROVIDER;
    const provider = getLLMProvider();
    expect(typeof provider.generateResponse).toBe('function');
    const result = await provider.generateResponse([{ role: 'USER', content: 'test' }]);
    expect(typeof result).toBe('string');
  });
});
