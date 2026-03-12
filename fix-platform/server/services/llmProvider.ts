/**
 * LLM Provider Service - Pluggable AI language model interface.
 *
 * PURPOSE:
 * Provides a common interface for AI language model providers, allowing the
 * assistant feature to work with any LLM backend (OpenAI, Anthropic, etc.)
 * without coupling the route logic to a specific provider.
 *
 * EXPORTS:
 * - ChatMessage: Type representing a single message in a conversation
 * - LLMProvider: Interface that all LLM providers must implement
 * - MockLLMProvider: Stub implementation for testing and development
 * - getLLMProvider(): Factory that returns the configured provider
 *
 * USAGE:
 * ```typescript
 * import { getLLMProvider } from './llmProvider.js';
 *
 * const provider = getLLMProvider();
 * const response = await provider.generateResponse(messages, context);
 * ```
 *
 * CONFIGURATION:
 * Set LLM_PROVIDER env var to select the provider (default: 'mock').
 * Real provider integration (OpenAI, Anthropic, etc.) is deferred to a future ticket.
 *
 * RELATED FILES:
 * - server/routes/platform/assistant.ts  - uses this provider
 * - tests/unit/llmProvider.test.ts       - unit tests
 */

import { theme } from '../theme.js';

/**
 * A single message in a chat conversation.
 */
export interface ChatMessage {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
}

/**
 * Interface that all LLM providers must implement.
 * Pluggable — swap out the implementation without changing route logic.
 */
export interface LLMProvider {
  /**
   * Generate an AI response given a conversation history and optional context.
   *
   * @param messages - Ordered conversation history (oldest first)
   * @param context  - Optional injected context (building rules, FAQs, etc.)
   * @returns The AI-generated response text
   */
  generateResponse(messages: ChatMessage[], context?: string): Promise<string>;
}

/**
 * Mock LLM provider for testing and development.
 * Returns canned responses without making any external API calls.
 */
export class MockLLMProvider implements LLMProvider {
  private static getCannedResponses(): string[] {
    return [
      theme.assistantIntro,
      "To book an amenity like the gym or rooftop pool, visit the Bookings section in your resident portal and select your preferred time slot.",
      "The building's amenities include a gym, rooftop pool, resident lounge, and conference rooms. Each amenity has specific hours and booking requirements.",
      "For maintenance requests, please use the Maintenance section in the portal. Our team typically responds within 24 hours for non-emergency issues.",
      "Package deliveries are handled through our Parcels system. You'll receive a notification when a package arrives, and you can track it in the Parcels section.",
      "Building quiet hours are from 10pm to 8am on weekdays, and 11pm to 9am on weekends. Please respect your neighbors during these times.",
      "For visitor access, you can register guests through the Visitors section. Visitors will need to check in at the front desk.",
      "I can help you with questions about building rules, amenity bookings, maintenance requests, and general building information. Feel free to ask!",
    ];
  }

  async generateResponse(messages: ChatMessage[], _context?: string): Promise<string> {
    // Return a response based on the last user message content, or a default
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'USER');
    const responses = MockLLMProvider.getCannedResponses();

    if (!lastUserMessage) {
      return responses[0];
    }

    const content = lastUserMessage.content.toLowerCase();

    if (content.includes('book') || content.includes('reserv')) {
      return responses[1];
    }
    if (content.includes('amenity') || content.includes('amenities') || content.includes('gym') || content.includes('pool')) {
      return responses[2];
    }
    if (content.includes('maintenance') || content.includes('repair') || content.includes('fix')) {
      return responses[3];
    }
    if (content.includes('package') || content.includes('parcel') || content.includes('delivery')) {
      return responses[4];
    }
    if (content.includes('quiet') || content.includes('noise')) {
      return responses[5];
    }
    if (content.includes('visitor') || content.includes('guest')) {
      return responses[6];
    }

    return responses[7];
  }
}

/**
 * Factory function that returns the configured LLM provider.
 *
 * Uses LLM_PROVIDER env var to select the provider:
 * - 'mock' (or unset): MockLLMProvider — canned responses, no external calls
 *
 * Real provider integration (OpenAI, Anthropic, etc.) is deferred to a future ticket.
 */
export function getLLMProvider(): LLMProvider {
  const providerName = process.env.LLM_PROVIDER ?? 'mock';

  switch (providerName) {
    case 'mock':
    default:
      return new MockLLMProvider();
  }
}
