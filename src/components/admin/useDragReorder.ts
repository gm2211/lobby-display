/**
 * useDragReorder - Pointer-based drag-and-drop reordering for admin lists.
 *
 * PURPOSE:
 * Lets editors reorder list rows (e.g., Events) by dragging a handle.
 * Built on Pointer Events, so it works with mouse, touch (iPad/phone) and pen,
 * unlike the HTML5 drag-and-drop API which does not fire on touch screens.
 *
 * BEHAVIOR:
 * - Press a row's handle and move: the row lifts (shadow + slight scale) and
 *   follows the pointer/finger 1:1. Rows it passes slide out of the way with
 *   a short transform transition. The DOM order does NOT change mid-drag.
 * - Release: the row glides into its slot, then `onCommit(newOrder)` is
 *   called once (only if the order changed).
 * - Pointer cancel (e.g., OS gesture) or Escape: reverts without committing.
 * - Keyboard: focus the handle, ArrowUp/ArrowDown moves the row one slot
 *   and commits immediately.
 * - The page auto-scrolls when dragging near the top/bottom of the viewport.
 * - Honors prefers-reduced-motion (no slide/glide transitions).
 *
 * USAGE:
 * ```tsx
 * const { rowRef, rowStyle, handleProps } = useDragReorder(events, commit);
 * events.map(e => (
 *   <div ref={rowRef(e.id)} style={{ ...base, ...rowStyle(e.id) }}>
 *     <span {...handleProps(e.id)}>⋮⋮</span> ...
 *   </div>
 * ));
 * ```
 *
 * GOTCHAS / AI AGENT NOTES:
 * - Row geometry is measured once at pickup (document coordinates), so the
 *   list must not change size while dragging.
 * - The handle needs `touch-action: none` (included in handleProps.style) or
 *   touch devices will scroll the page instead of dragging.
 * - rowStyle only sets transform/transition/boxShadow/zIndex/position — keep
 *   base row styles longhand (see CLAUDE.md CSS shorthand gotcha).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';

const EDGE_SCROLL_PX = 60;
const EDGE_SCROLL_STEP = 12;
const SLIDE_MS = 180;

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Row box in document coordinates, captured at pickup. */
interface Slot { id: number; top: number; bottom: number }

interface DragState {
  id: number;
  from: number;
  to: number;
  /** Pointer travel (px) incl. page scroll since pickup */
  dy: number;
  /** Dropping: row is gliding into its slot before commit */
  dropping: boolean;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function useDragReorder<T extends { id: number }>(
  source: T[],
  onCommit: (ordered: T[]) => void,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const slots = useRef<Slot[]>([]);
  const start = useRef({ clientY: 0, scrollY: 0 });
  const lastClientY = useRef(0);
  const rows = useRef(new Map<number, HTMLElement>());
  const dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (dropTimer.current) clearTimeout(dropTimer.current); }, []);

  const rowRef = useCallback(
    (id: number) => (el: HTMLElement | null) => {
      if (el) rows.current.set(id, el);
      else rows.current.delete(id);
    },
    [],
  );

  const update = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  /** Where the dragged row's slot is, relative to its original slot. */
  const targetOffset = (from: number, to: number) => {
    const s = slots.current;
    if (to > from) return s[to].bottom - s[from].bottom;
    if (to < from) return s[to].top - s[from].top;
    return 0;
  };

  /** Which index the dragged row would land on, given its travel. */
  const computeTarget = (from: number, dy: number) => {
    const s = slots.current;
    const center = (s[from].top + s[from].bottom) / 2 + dy;
    let to = from;
    for (let i = from + 1; i < s.length; i++) {
      if (center > (s[i].top + s[i].bottom) / 2) to = i;
    }
    for (let i = from - 1; i >= 0; i--) {
      if (center < (s[i].top + s[i].bottom) / 2) to = i;
    }
    return to;
  };

  const track = (clientY: number) => {
    const d = dragRef.current;
    if (!d || d.dropping) return;
    lastClientY.current = clientY;
    const dy = clientY - start.current.clientY + (window.scrollY - start.current.scrollY);
    update({ ...d, dy, to: computeTarget(d.from, dy) });
  };

  const finish = (commit: boolean) => {
    const d = dragRef.current;
    if (!d || d.dropping) return;
    const changed = commit && d.to !== d.from;
    const final = changed ? move(source, d.from, d.to) : null;
    const settle = () => {
      dropTimer.current = null;
      if (final) onCommit(final);
      update(null);
    };
    if (prefersReducedMotion()) {
      settle();
      return;
    }
    // Glide into the slot (or back home), then commit the new order.
    update({ ...d, dropping: true, dy: changed ? targetOffset(d.from, d.to) : 0, to: changed ? d.to : d.from });
    dropTimer.current = setTimeout(settle, SLIDE_MS);
  };

  const rowStyle = (id: number): CSSProperties => {
    if (!drag) return {};
    const animate = !prefersReducedMotion();
    if (id === drag.id) {
      return {
        position: 'relative',
        zIndex: 10,
        transform: `translateY(${drag.dy}px) scale(${drag.dropping ? 1 : 1.02})`,
        transition: drag.dropping && animate ? `transform ${SLIDE_MS}ms ease, box-shadow ${SLIDE_MS}ms ease` : 'none',
        boxShadow: drag.dropping ? 'none' : '0 10px 24px rgba(0,0,0,0.22)',
        willChange: 'transform',
      };
    }
    const index = slots.current.findIndex(s => s.id === id);
    const { from, to } = drag;
    const s = slots.current;
    const draggedSize = s[from] && s[from + 1] ? s[from + 1].top - s[from].top
      : s[from] && s[from - 1] ? s[from].bottom - s[from - 1].bottom : 0;
    let shift = 0;
    if (to > from && index > from && index <= to) shift = -draggedSize;
    if (to < from && index >= to && index < from) shift = draggedSize;
    return {
      position: 'relative',
      transform: `translateY(${shift}px)`,
      transition: animate ? `transform ${SLIDE_MS}ms ease` : 'none',
    };
  };

  const handleProps = (id: number) => ({
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': 'Drag to reorder (or use arrow keys)',
    title: 'Drag to reorder',
    style: {
      cursor: drag?.id === id ? 'grabbing' : 'grab',
      touchAction: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
    } as CSSProperties,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (dragRef.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      slots.current = source.map(item => {
        const r = rows.current.get(item.id)?.getBoundingClientRect();
        return { id: item.id, top: (r?.top ?? 0) + window.scrollY, bottom: (r?.bottom ?? 0) + window.scrollY };
      });
      start.current = { clientY: e.clientY, scrollY: window.scrollY };
      lastClientY.current = e.clientY;
      const from = source.findIndex(item => item.id === id);
      navigator.vibrate?.(10);
      update({ id, from, to: from, dy: 0, dropping: false });
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (dragRef.current?.id !== id) return;
      if (e.clientY < EDGE_SCROLL_PX) window.scrollBy(0, -EDGE_SCROLL_STEP);
      else if (e.clientY > window.innerHeight - EDGE_SCROLL_PX) window.scrollBy(0, EDGE_SCROLL_STEP);
      track(e.clientY);
    },
    onPointerUp: () => {
      if (dragRef.current?.id === id) finish(true);
    },
    onPointerCancel: () => {
      if (dragRef.current?.id === id) finish(false);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (dragRef.current) {
        if (e.key === 'Escape') finish(false);
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

  return { draggingId: drag?.id ?? null, rowRef, rowStyle, handleProps };
}
