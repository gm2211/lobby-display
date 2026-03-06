/**
 * Tests for src/platform/styles/tokens.css
 *
 * Reads the CSS file directly and verifies that all required design tokens
 * are present and syntactically valid (i.e. defined with `--platform-` prefix
 * and a non-empty value).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const TOKENS_PATH = resolve(
  __dirname,
  '../../src/platform/styles/tokens.css',
);

let css: string;

beforeAll(() => {
  css = readFileSync(TOKENS_PATH, 'utf-8');
});

// Helper: assert that a CSS custom property is declared
function expectToken(name: string) {
  // Matches e.g.:  --platform-color-primary-500: #1a3a6e;
  const pattern = new RegExp(`${name}\\s*:`);
  expect(css, `Missing token: ${name}`).toMatch(pattern);
}

// Helper: assert that the declared value is non-empty (not just whitespace or a semicolon)
function expectTokenValue(name: string) {
  const pattern = new RegExp(`${name}\\s*:\\s*([^;\\n]+)`);
  const match = css.match(pattern);
  expect(match, `Token not found: ${name}`).not.toBeNull();
  if (match) {
    const value = match[1].trim();
    expect(value.length, `Token has empty value: ${name}`).toBeGreaterThan(0);
  }
}

describe('platform design tokens — tokens.css', () => {
  describe('file exists and is non-empty', () => {
    it('reads the tokens file', () => {
      expect(css).toBeTruthy();
      expect(css.length).toBeGreaterThan(100);
    });

    it('contains :root selector', () => {
      expect(css).toMatch(/:root/);
    });
  });

  describe('color palette — primary (navy)', () => {
    const primaryTokens = [
      '--platform-color-primary-50',
      '--platform-color-primary-100',
      '--platform-color-primary-200',
      '--platform-color-primary-300',
      '--platform-color-primary-400',
      '--platform-color-primary-500',
      '--platform-color-primary-600',
      '--platform-color-primary-700',
      '--platform-color-primary-800',
      '--platform-color-primary-900',
    ];

    for (const token of primaryTokens) {
      it(`defines ${token}`, () => expectTokenValue(token));
    }
  });

  describe('color palette — secondary (gold/amber)', () => {
    const secondaryTokens = [
      '--platform-color-secondary-50',
      '--platform-color-secondary-100',
      '--platform-color-secondary-200',
      '--platform-color-secondary-300',
      '--platform-color-secondary-400',
      '--platform-color-secondary-500',
      '--platform-color-secondary-600',
      '--platform-color-secondary-700',
      '--platform-color-secondary-800',
      '--platform-color-secondary-900',
    ];

    for (const token of secondaryTokens) {
      it(`defines ${token}`, () => expectTokenValue(token));
    }
  });

  describe('color palette — neutrals', () => {
    const neutralTokens = [
      '--platform-color-neutral-0',
      '--platform-color-neutral-50',
      '--platform-color-neutral-100',
      '--platform-color-neutral-200',
      '--platform-color-neutral-300',
      '--platform-color-neutral-400',
      '--platform-color-neutral-500',
      '--platform-color-neutral-600',
      '--platform-color-neutral-700',
      '--platform-color-neutral-800',
      '--platform-color-neutral-900',
    ];

    for (const token of neutralTokens) {
      it(`defines ${token}`, () => expectTokenValue(token));
    }
  });

  describe('color palette — semantic', () => {
    const semanticTokens = [
      '--platform-color-success-light',
      '--platform-color-success',
      '--platform-color-success-dark',
      '--platform-color-warning-light',
      '--platform-color-warning',
      '--platform-color-warning-dark',
      '--platform-color-error-light',
      '--platform-color-error',
      '--platform-color-error-dark',
      '--platform-color-info-light',
      '--platform-color-info',
      '--platform-color-info-dark',
    ];

    for (const token of semanticTokens) {
      it(`defines ${token}`, () => expectTokenValue(token));
    }
  });

  describe('semantic surface / text tokens', () => {
    const surfaceTokens = [
      '--platform-bg-page',
      '--platform-bg-surface',
      '--platform-bg-subtle',
      '--platform-bg-muted',
      '--platform-text-primary',
      '--platform-text-secondary',
      '--platform-text-muted',
      '--platform-text-inverse',
      '--platform-text-accent',
      '--platform-border-subtle',
      '--platform-border-default',
      '--platform-border-strong',
      '--platform-border-accent',
      '--platform-accent-primary',
      '--platform-accent-secondary',
    ];

    for (const token of surfaceTokens) {
      it(`defines ${token}`, () => expectTokenValue(token));
    }
  });

  describe('typography — font families', () => {
    it('defines --platform-font-sans', () => expectTokenValue('--platform-font-sans'));
    it('defines --platform-font-serif', () => expectTokenValue('--platform-font-serif'));
    it('defines --platform-font-mono', () => expectTokenValue('--platform-font-mono'));
  });

  describe('typography — heading sizes (h1–h6)', () => {
    const headingSizes = [
      '--platform-text-h1',
      '--platform-text-h2',
      '--platform-text-h3',
      '--platform-text-h4',
      '--platform-text-h5',
      '--platform-text-h6',
    ];

    for (const token of headingSizes) {
      it(`defines ${token}`, () => expectTokenValue(token));
    }
  });

  describe('typography — body sizes', () => {
    const bodySizes = [
      '--platform-text-xl',
      '--platform-text-lg',
      '--platform-text-base',
      '--platform-text-sm',
      '--platform-text-xs',
      '--platform-text-caption',
    ];

    for (const token of bodySizes) {
      it(`defines ${token}`, () => expectTokenValue(token));
    }
  });

  describe('typography — font weights', () => {
    const weights = [
      '--platform-weight-light',
      '--platform-weight-regular',
      '--platform-weight-medium',
      '--platform-weight-semibold',
      '--platform-weight-bold',
      '--platform-weight-extrabold',
    ];

    for (const token of weights) {
      it(`defines ${token}`, () => expectTokenValue(token));
    }
  });

  describe('spacing scale (4px base)', () => {
    // Required: 4, 8, 12, 16, 24, 32, 48, 64 px
    const spacingTokens = [
      '--platform-space-1',  /*  4px */
      '--platform-space-2',  /*  8px */
      '--platform-space-3',  /* 12px */
      '--platform-space-4',  /* 16px */
      '--platform-space-6',  /* 24px */
      '--platform-space-8',  /* 32px */
      '--platform-space-12', /* 48px */
      '--platform-space-16', /* 64px */
    ];

    for (const token of spacingTokens) {
      it(`defines ${token}`, () => expectTokenValue(token));
    }

    it('--platform-space-1 is 0.25rem (4px)', () => {
      expect(css).toMatch(/--platform-space-1\s*:\s*0\.25rem/);
    });

    it('--platform-space-2 is 0.5rem (8px)', () => {
      expect(css).toMatch(/--platform-space-2\s*:\s*0\.5rem/);
    });

    it('--platform-space-4 is 1rem (16px)', () => {
      expect(css).toMatch(/--platform-space-4\s*:\s*1rem/);
    });

    it('--platform-space-16 is 4rem (64px)', () => {
      expect(css).toMatch(/--platform-space-16\s*:\s*4rem/);
    });
  });

  describe('border radius tokens', () => {
    const radiusTokens = [
      '--platform-radius-none',
      '--platform-radius-sm',
      '--platform-radius-base',
      '--platform-radius-md',
      '--platform-radius-lg',
      '--platform-radius-xl',
      '--platform-radius-2xl',
      '--platform-radius-3xl',
      '--platform-radius-full',
    ];

    for (const token of radiusTokens) {
      it(`defines ${token}`, () => expectTokenValue(token));
    }
  });

  describe('shadow / elevation tokens', () => {
    const shadowTokens = [
      '--platform-shadow-none',
      '--platform-shadow-sm',
      '--platform-shadow-base',
      '--platform-shadow-md',
      '--platform-shadow-lg',
      '--platform-shadow-xl',
      '--platform-shadow-accent',
      '--platform-shadow-inset',
    ];

    for (const token of shadowTokens) {
      it(`defines ${token}`, () => expectToken(token));
    }
  });

  describe('dark mode support', () => {
    it('includes data-platform-theme="dark" selector', () => {
      expect(css).toMatch(/\[data-platform-theme="dark"\]/);
    });

    it('includes data-platform-theme="light" selector', () => {
      expect(css).toMatch(/\[data-platform-theme="light"\]/);
    });

    it('includes prefers-color-scheme: dark media query', () => {
      expect(css).toMatch(/prefers-color-scheme\s*:\s*dark/);
    });

    it('overrides bg tokens in dark mode', () => {
      // The dark-mode block must re-declare the surface tokens
      const darkSection = css.slice(css.indexOf('[data-platform-theme="dark"]'));
      expect(darkSection).toMatch(/--platform-bg-page/);
      expect(darkSection).toMatch(/--platform-text-primary/);
    });
  });

  describe('token naming convention', () => {
    it('all custom properties use the --platform- prefix', () => {
      // Extract all custom property declarations
      const allProps = [...css.matchAll(/--[\w-]+\s*:/g)].map(m =>
        m[0].replace(/\s*:$/, '').trim(),
      );
      const invalid = allProps.filter(p => !p.startsWith('--platform-'));
      expect(invalid).toHaveLength(0);
    });
  });
});
