/** Escape HTML special characters to prevent XSS. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parses a simple markdown string and returns HTML.
 * Supports: headers (#, ##, ###), bold, italic, strikethrough, inline code,
 * bullet lists (- or *), and numbered lists (1. 2. etc).
 *
 * All input is HTML-escaped before processing to prevent XSS.
 */
export function parseMarkdown(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let inBulletList = false;
  let inNumberedList = false;
  let listCounter = 0;

  const bulletStyle = 'list-style:none;padding:0;margin:8px 0';
  const olStyle = 'list-style:none;padding:0;margin:8px 0;counter-reset:item';
  const bulletLiStyle = 'display:flex;align-items:baseline;gap:8px;margin-bottom:4px';
  const olLiStyle = 'display:flex;align-items:baseline;gap:8px;margin-bottom:4px;counter-increment:item';

  for (const line of lines) {
    let processed = escapeHtml(line);

    const bulletMatch = processed.match(/^[-*]\s+(.*)$/);
    const numberedMatch = processed.match(/^\d+\.\s+(.*)$/);

    if (bulletMatch) {
      if (!inBulletList) {
        if (inNumberedList) { result.push('</ol>'); inNumberedList = false; }
        result.push(`<ul style="${bulletStyle}">`);
        inBulletList = true;
      }
      processed = `<li style="${bulletLiStyle}"><span style="color:#e0e0e0;font-size:8px;flex-shrink:0">●</span><span>${bulletMatch[1]}</span></li>`;
    } else if (numberedMatch) {
      if (!inNumberedList) {
        if (inBulletList) { result.push('</ul>'); inBulletList = false; }
        result.push(`<ol style="${olStyle}">`);
        inNumberedList = true;
        listCounter = 0;
      }
      listCounter++;
      processed = `<li style="${olLiStyle}"><span style="color:#e0e0e0;font-size:12px;flex-shrink:0;min-width:16px">${listCounter}.</span><span>${numberedMatch[1]}</span></li>`;
    } else {
      if (inBulletList) { result.push('</ul>'); inBulletList = false; }
      if (inNumberedList) { result.push('</ol>'); inNumberedList = false; listCounter = 0; }

      if (processed.match(/^### (.+)$/)) {
        processed = processed.replace(/^### (.+)$/, '<h3 style="margin:8px 0 4px;font-size:14px">$1</h3>');
      } else if (processed.match(/^## (.+)$/)) {
        processed = processed.replace(/^## (.+)$/, '<h2 style="margin:8px 0 4px;font-size:16px">$1</h2>');
      } else if (processed.match(/^# (.+)$/)) {
        processed = processed.replace(/^# (.+)$/, '<h1 style="margin:8px 0 4px;font-size:18px">$1</h1>');
      } else if (processed.trim() === '') {
        processed = '<br/>';
      } else {
        processed = processed + '<br/>';
      }
    }

    // Inline formatting
    processed = processed
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/`(.+?)`/g, '<code style="background:#1a3050;padding:2px 4px;border-radius:3px">$1</code>');

    result.push(processed);
  }

  if (inBulletList) result.push('</ul>');
  if (inNumberedList) result.push('</ol>');

  return result.join('');
}
