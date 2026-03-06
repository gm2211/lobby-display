/**
 * EventCardPreview - Preview component matching EventCard styling.
 *
 * PURPOSE:
 * Provides a preview of how an event card will look on the dashboard.
 * Used in the admin interface when editing events to show live preview.
 *
 * IMPORTANT:
 * Keep styles synchronized with src/components/EventCard.tsx!
 * Any changes to EventCard appearance should be reflected here.
 *
 * PROPS:
 * - title: Event title (required in UI but handles empty gracefully)
 * - subtitle: Event subtitle (optional)
 * - imageUrl: Background image URL (optional - uses gradient if empty)
 * - details: Markdown content as string (will be parsed and rendered)
 *
 * GOTCHAS / AI AGENT NOTES:
 * - Width is fixed at 450px to match typical dashboard card width
 * - Uses EVENT_CARD_GRADIENT from constants for background
 * - Renders markdown using parseMarkdown utility
 *
 * RELATED FILES:
 * - src/components/EventCard.tsx - The actual dashboard component (keep in sync!)
 * - src/constants/config.ts - EVENT_CARD_GRADIENT
 * - src/utils/markdown.ts - parseMarkdown function
 */
import type { CSSProperties } from 'react';
import { EVENT_CARD_GRADIENT } from '../../constants';
import { parseMarkdown } from '../../utils/markdown';

export interface CardPreviewData {
  title: string;
  subtitle: string;
  imageUrl: string;
}

interface EventCardPreviewProps extends CardPreviewData {
  /** Markdown content to render in the card body */
  details: string;
}

export function EventCardPreview({ title, subtitle, imageUrl, details }: EventCardPreviewProps) {
  // Match actual EventCard component styling
  // On the dashboard, cards take full container width (~400-500px typically)
  const cardStyle: CSSProperties = {
    background: imageUrl
      ? EVENT_CARD_GRADIENT.withImage(imageUrl)
      : EVENT_CARD_GRADIENT.noImage,
    backgroundSize: imageUrl ? '100% 100%, cover' : undefined,
    backgroundPosition: imageUrl ? 'center, center' : undefined,
    backgroundRepeat: 'no-repeat',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.1)',
    display: 'flex',
    flexDirection: 'column',
    width: '450px', // Match typical dashboard card width
    minWidth: '450px',
  };

  const renderedMarkdown = parseMarkdown(details);

  return (
    <div style={cardStyle}>
      <div style={{ padding: '24px 28px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>
          {title || <span style={{ color: '#666', fontWeight: 400 }}>No title</span>}
        </h3>
        {(subtitle || !title) && (
          <p style={{ fontSize: '14px', color: '#b0d4d0', margin: '0 0 14px', fontStyle: 'italic' }}>
            {subtitle || <span style={{ color: '#557' }}>No subtitle</span>}
          </p>
        )}
        {details.trim() ? (
          <div
            style={{ fontSize: '14px', color: '#e0e0e0', lineHeight: 1.5 }}
            dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
          />
        ) : (
          <p style={{ margin: 0, color: '#557', fontSize: '13px', fontStyle: 'italic' }}>
            No details yet
          </p>
        )}
      </div>
      <div style={{ height: '4px', width: '100%', background: '#00bcd4' }} />
    </div>
  );
}
