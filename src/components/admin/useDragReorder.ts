/**
 * useDragReorder - Pointer-based drag-and-drop reordering for admin lists.
 *
 * PURPOSE:
 * Lets editors reorder list rows (e.g., Events) by dragging a handle.
 * Built on Pointer Events, so it works with mouse, touch (iPad) and pen,
 * unlike the HTML5 drag-and-drop API which does not fire on touch screens.
 *
 * BEHAVIOR:
 * - Press a row's handle and move: the row moves live as the pointer
 *   crosses the midpoint of a neighbouring row.
 * - Release: `onCommit(newOrder)` is called once, only if the order changed.
 * - Pointer cancel (e.g., OS gesture) or Escape: reverts without committing.
 * - Keyboard: focus the handle, ArrowUp/ArrowDown moves the row one slot
 *   and commits immediately.
 * - The page auto-scrolls when dragging near the top/bottom of the viewport.
 *
 * USAGE:
 * ```tsx
 * const { items, draggingId, rowRef, handleProps } = useDragReorder(events, commit);
 * items.map(e => (
 *   <div ref={rowRef(e.id)}>
 *     <span {...handleProps(e.id)}>⋮⋮</span> ...
 *   </div>
 * ));
 * ```
 *
 * GOTCHAS / AI AGENT NOTES:
 * - Render the returned `items` (not your source list) so the live order shows.
 * - The handle needs `touch-action: none` (included in handleProps.style) or
 *   touch devices will scroll the page instead of dragging.
 */
import { useCallback, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';

const EDGE_SCROLL_PX = 60;
const EDGE_SCROLL_STEP = 12;

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function useDragReorder<T extends { id: number }>(
  source: T[],
  onCommit: (ordered: T[]) => void,
) {
  const [draft, setDraft] = useState<T[] | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const draftRef = useRef<T[] | null>(null);
  const draggingRef = useRef<number | null>(null);
  const rows = useRef(new Map<number, HTMLElement>());

  const rowRef = useCallback(
    (id: number) => (el: HTMLElement | null) => {
      if (el) rows.current.set(id, el);
      else rows.current.delete(id);
    },
    [],
  );

  const setOrder = (next: T[] | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const end = (commit: boolean) => {
    const final = draftRef.current;
    draggingRef.current = null;
    setDraggingId(null);
    setOrder(null);
    if (commit && final && final.some((item, i) => item.id !== source[i]?.id)) {
      onCommit(final);
    }
  };

  const handleProps = (id: number) => ({
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': 'Drag to reorder (or use arrow keys)',
    title: 'Drag to reorder',
    style: {
      cursor: draggingId === id ? 'grabbing' : 'grab',
      touchAction: 'none',
      userSelect: 'none',
    } as CSSProperties,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      draggingRef.current = id;
      setDraggingId(id);
      setOrder([...source]);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const cur = draftRef.current;
      if (draggingRef.current !== id || !cur) return;

      if (e.clientY < EDGE_SCROLL_PX) window.scrollBy(0, -EDGE_SCROLL_STEP);
      else if (e.clientY > window.innerHeight - EDGE_SCROLL_PX) window.scrollBy(0, EDGE_SCROLL_STEP);

      const from = cur.findIndex(item => item.id === id);
      for (let i = 0; i < cur.length; i++) {
        if (i === from) continue;
        const rect = rows.current.get(cur[i].id)?.getBoundingClientRect();
        if (!rect || e.clientY < rect.top || e.clientY > rect.bottom) continue;
        const mid = rect.top + rect.height / 2;
        if ((i > from && e.clientY > mid) || (i < from && e.clientY < mid)) {
          setOrder(move(cur, from, i));
        }
        break;
      }
    },
    onPointerUp: () => {
      if (draggingRef.current === id) end(true);
    },
    onPointerCancel: () => {
      if (draggingRef.current === id) end(false);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (draggingRef.current !== null) {
        if (e.key === 'Escape') end(false);
        return;
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const from = source.findIndex(item => item.id === id);
      const to = e.key === 'ArrowUp' ? from - 1 : from + 1;
      if (from < 0 || to < 0 || to >= source.length) return;
      onCommit(move(source, from, to));
    },
  });

  return { items: draft ?? source, draggingId, rowRef, handleProps };
}
