/**
 * MarkdownEditor - Rich text editor with toolbar and live preview.
 *
 * PURPOSE:
 * Provides a textarea with formatting toolbar and preview capability.
 * Used for editing event details with markdown-like syntax.
 *
 * FEATURES:
 * - Bold (**text**), italic (*text*), strikethrough (~~text~~) buttons
 * - Bullet list (- item) and numbered list (1. item) support
 * - Auto-continuation: pressing Enter on a list item continues the list
 * - Preview mode shows rendered markdown or card preview
 * - Active format indicator highlights current list type
 *
 * AUTO-LIST BEHAVIOR (IMPORTANT - don't break this!):
 * - Pressing Enter on a bullet line (- text) continues with "- "
 * - Pressing Enter on a numbered line (1. text) continues with "2. "
 * - Pressing Enter on an EMPTY bullet/number removes the marker
 * - Tab behavior is NOT implemented (uses browser default)
 *
 * PROPS:
 * - value: Current markdown text
 * - onChange: Callback when text changes
 * - placeholder: Optional placeholder text
 * - cardPreview: If provided, preview shows EventCardPreview instead of raw markdown
 *
 * GOTCHAS / AI AGENT NOTES:
 * - The insertMarkdown and insertLinePrefix functions handle cursor positioning
 * - Be careful when modifying - test list continuation thoroughly
 * - cursorPos state is used to detect current line format for active indicators
 *
 * RELATED FILES:
 * - src/utils/markdown.ts - parseMarkdown function for rendering
 * - src/components/admin/EventCardPreview.tsx - Used when cardPreview is provided
 */
import { useState, useRef } from 'react';
import type { CSSProperties } from 'react';
import { smallBtn, smallBtnInfo } from '../../styles';
import { parseMarkdown } from '../../utils/markdown';
import { EventCardPreview, type CardPreviewData } from './EventCardPreview';

/** Input style matching the admin light theme */
const inputStyle: CSSProperties = {
  background: '#fff',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#ddd',
  borderRadius: '6px',
  padding: '8px 12px',
  color: '#333',
  fontSize: '14px',
};

const toolbarBtnStyle: CSSProperties = {
  background: '#f0f0f0',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#ccc',
  borderRadius: '4px',
  padding: '4px 8px',
  color: '#444',
  cursor: 'pointer',
  fontSize: '12px',
  minWidth: '28px',
};

const toolbarBtnActiveStyle: CSSProperties = {
  ...toolbarBtnStyle,
  background: 'var(--theme-color-primary-500)',
  borderColor: 'var(--theme-color-primary-700)',
  color: '#fff',
};

interface MarkdownEditorProps {
  /** Current markdown text value */
  value: string;
  /** Callback when text changes */
  onChange: (value: string) => void;
  /** Optional placeholder text for empty editor */
  placeholder?: string;
  /** If provided, preview shows card preview instead of raw markdown */
  cardPreview?: CardPreviewData;
}

export function MarkdownEditor({ value, onChange, placeholder, cardPreview }: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Detect current line format based on cursor position
  const getCurrentLineFormat = () => {
    let lineStart = cursorPos;
    while (lineStart > 0 && value[lineStart - 1] !== '\n') {
      lineStart--;
    }
    const lineEnd = value.indexOf('\n', cursorPos);
    const currentLine = value.substring(lineStart, lineEnd === -1 ? value.length : lineEnd);

    if (/^\s*[-*]\s/.test(currentLine)) return 'bullet';
    if (/^\s*\d+\.\s/.test(currentLine)) return 'numbered';
    return null;
  };

  const lineFormat = getCurrentLineFormat();

  const updateCursorPos = () => {
    if (textareaRef.current) {
      setCursorPos(textareaRef.current.selectionStart);
    }
  };

  /**
   * Insert markdown formatting around selected text or at cursor.
   * For symmetric markers like ** or *, wraps selection or inserts pair.
   */
  const insertMarkdown = (prefix: string, suffix: string = prefix) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = value;
    const selectedText = text.substring(start, end);

    const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
    onChange(newText);

    // Restore cursor position after the inserted text
    setTimeout(() => {
      textarea.focus();
      const newPos = selectedText
        ? start + prefix.length + selectedText.length + suffix.length
        : start + prefix.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  /**
   * Insert prefix at the start of selected lines (for lists).
   * If multiple lines selected, applies to each line.
   */
  const insertLinePrefix = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = value;

    // Find the start of the first selected line
    let lineStart = start;
    while (lineStart > 0 && text[lineStart - 1] !== '\n') {
      lineStart--;
    }

    // Find the end of the last selected line
    let lineEnd = end;
    while (lineEnd < text.length && text[lineEnd] !== '\n') {
      lineEnd++;
    }

    // Get all selected lines
    const selectedText = text.substring(lineStart, lineEnd);
    const lines = selectedText.split('\n');

    // Apply prefix to each line
    const prefixedLines = lines.map((line, i) => {
      // For numbered lists, increment the number for each line
      if (prefix === '1. ') {
        return `${i + 1}. ${line}`;
      }
      return prefix + line;
    });

    const newText = text.substring(0, lineStart) + prefixedLines.join('\n') + text.substring(lineEnd);
    onChange(newText);

    // Calculate new selection: select all the prefixed lines
    const newSelectionStart = lineStart;
    const newSelectionEnd = lineStart + prefixedLines.join('\n').length;

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newSelectionStart, newSelectionEnd);
    }, 0);
  };

  /**
   * Handle Enter key to continue bullet/numbered lists.
   * Also handles removing empty list markers.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const text = value;

    // Find the start of the current line
    let lineStart = start;
    while (lineStart > 0 && text[lineStart - 1] !== '\n') {
      lineStart--;
    }

    const currentLine = text.substring(lineStart, start);

    // Check for bullet list (- or *)
    const bulletMatch = currentLine.match(/^(\s*)([-*])\s/);
    if (bulletMatch) {
      // If line is empty bullet, remove it instead of continuing
      if (currentLine.trim() === bulletMatch[2]) {
        e.preventDefault();
        const newText = text.substring(0, lineStart) + text.substring(start);
        onChange(newText);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(lineStart, lineStart);
        }, 0);
        return;
      }
      e.preventDefault();
      const prefix = `\n${bulletMatch[1]}${bulletMatch[2]} `;
      const newText = text.substring(0, start) + prefix + text.substring(start);
      onChange(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + prefix.length, start + prefix.length);
      }, 0);
      return;
    }

    // Check for numbered list (1. 2. etc)
    const numberedMatch = currentLine.match(/^(\s*)(\d+)\.\s/);
    if (numberedMatch) {
      // If line is empty number, remove it instead of continuing
      if (currentLine.trim() === `${numberedMatch[2]}.`) {
        e.preventDefault();
        const newText = text.substring(0, lineStart) + text.substring(start);
        onChange(newText);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(lineStart, lineStart);
        }, 0);
        return;
      }
      e.preventDefault();
      const nextNum = parseInt(numberedMatch[2], 10) + 1;
      const prefix = `\n${numberedMatch[1]}${nextNum}. `;
      const newText = text.substring(0, start) + prefix + text.substring(start);
      onChange(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + prefix.length, start + prefix.length);
      }, 0);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: '#888' }}>Details (markdown supported)</span>
        <button
          type="button"
          style={{ ...smallBtn, ...(showPreview ? smallBtnInfo : {}), marginLeft: 'auto' }}
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? 'Edit' : cardPreview ? 'Preview Card' : 'Preview'}
        </button>
      </div>

      {/* Toolbar - only shown in edit mode */}
      {!showPreview && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
          <button
            type="button"
            style={{ ...toolbarBtnStyle, fontWeight: 'bold' }}
            onClick={() => insertMarkdown('**')}
            title="Bold"
          >
            B
          </button>
          <button
            type="button"
            style={{ ...toolbarBtnStyle, fontStyle: 'italic' }}
            onClick={() => insertMarkdown('*')}
            title="Italic"
          >
            I
          </button>
          <button
            type="button"
            style={{ ...toolbarBtnStyle, textDecoration: 'line-through' }}
            onClick={() => insertMarkdown('~~')}
            title="Strikethrough"
          >
            S
          </button>
          <button
            type="button"
            style={lineFormat === 'bullet' ? toolbarBtnActiveStyle : toolbarBtnStyle}
            onClick={() => insertLinePrefix('- ')}
            title="Bullet list"
          >
            •
          </button>
          <button
            type="button"
            style={lineFormat === 'numbered' ? toolbarBtnActiveStyle : toolbarBtnStyle}
            onClick={() => insertLinePrefix('1. ')}
            title="Numbered list"
          >
            1.
          </button>
        </div>
      )}

      {/* Preview or Edit area */}
      {showPreview ? (
        cardPreview ? (
          <EventCardPreview {...cardPreview} details={value} />
        ) : (
          <div
            style={{
              ...inputStyle,
              minHeight: '100px',
              padding: '12px',
              lineHeight: 1.5,
              overflow: 'auto',
            }}
            dangerouslySetInnerHTML={{
              __html: parseMarkdown(value) || '<span style="color:#666">Nothing to preview</span>',
            }}
          />
        )
      ) : (
        <textarea
          ref={textareaRef}
          style={{ ...inputStyle, height: '100px', fontFamily: 'monospace', fontSize: '13px' }}
          placeholder={
            placeholder ||
            '**Bold**, *italic*, ~~strikethrough~~, `code`\n- Bullet list\n1. Numbered list'
          }
          value={value}
          onChange={e => {
            onChange(e.target.value);
            updateCursorPos();
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={updateCursorPos}
          onClick={updateCursorPos}
          onSelect={updateCursorPos}
        />
      )}
    </div>
  );
}
