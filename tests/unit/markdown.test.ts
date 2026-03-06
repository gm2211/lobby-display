import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../src/utils/markdown';

describe('parseMarkdown', () => {
  describe('HTML escaping (XSS prevention)', () => {
    it('escapes <script> tags', () => {
      const result = parseMarkdown('<script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('escapes <img onerror=...> payloads', () => {
      const result = parseMarkdown('<img onerror="alert(1)" src=x>');
      expect(result).not.toContain('<img');
      expect(result).toContain('&lt;img');
    });

    it('escapes ampersands', () => {
      const result = parseMarkdown('Tom & Jerry');
      expect(result).toContain('Tom &amp; Jerry');
    });

    it('escapes double quotes', () => {
      const result = parseMarkdown('She said "hello"');
      expect(result).toContain('&quot;hello&quot;');
    });

    it('escapes single quotes', () => {
      const result = parseMarkdown("It's fine");
      expect(result).toContain('It&#39;s fine');
    });

    it('escapes angle brackets in plain text', () => {
      const result = parseMarkdown('a < b > c');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
    });
  });

  describe('markdown formatting still works after escaping', () => {
    it('renders # heading', () => {
      const result = parseMarkdown('# Hello');
      expect(result).toContain('<h1');
      expect(result).toContain('Hello');
    });

    it('renders ## heading', () => {
      const result = parseMarkdown('## Subheading');
      expect(result).toContain('<h2');
      expect(result).toContain('Subheading');
    });

    it('renders ### heading', () => {
      const result = parseMarkdown('### Small');
      expect(result).toContain('<h3');
      expect(result).toContain('Small');
    });

    it('renders **bold** text', () => {
      const result = parseMarkdown('This is **bold** text');
      expect(result).toContain('<strong>bold</strong>');
    });

    it('renders *italic* text', () => {
      const result = parseMarkdown('This is *italic* text');
      expect(result).toContain('<em>italic</em>');
    });

    it('renders ~~strikethrough~~ text', () => {
      const result = parseMarkdown('This is ~~deleted~~ text');
      expect(result).toContain('<del>deleted</del>');
    });

    it('renders `inline code`', () => {
      const result = parseMarkdown('Use `code` here');
      expect(result).toContain('<code');
      expect(result).toContain('code');
    });

    it('renders bullet lists with - prefix', () => {
      const result = parseMarkdown('- Item one\n- Item two');
      expect(result).toContain('<ul');
      expect(result).toContain('<li');
      expect(result).toContain('Item one');
      expect(result).toContain('Item two');
    });

    it('renders numbered lists', () => {
      const result = parseMarkdown('1. First\n2. Second');
      expect(result).toContain('<ol');
      expect(result).toContain('<li');
      expect(result).toContain('First');
      expect(result).toContain('Second');
    });

    it('escapes HTML within markdown formatting', () => {
      const result = parseMarkdown('**<script>alert(1)</script>**');
      expect(result).toContain('<strong>&lt;script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('escapes HTML in list items', () => {
      const result = parseMarkdown('- <img onerror=x>');
      expect(result).toContain('&lt;img');
      expect(result).not.toContain('<img');
    });
  });
});
