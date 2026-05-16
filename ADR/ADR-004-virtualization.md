# ADR-004: Virtualization Library

**Status**: Accepted  
**Date**: 2025-01  

---

## Context

The live-tail event list must handle up to 100,000 events (assignment spec) while maintaining INP < 200ms and being screen-reader navigable (WCAG 2.2 AA). Rendering all events to the DOM is not possible — layout/paint thrash makes scrolling unusable above ~500 rows.

---

## Decision

**Custom window-based virtualization** (in `VirtualList` component within `LiveTailShell.js`).

Uses `position: absolute` + `top: idx * ROW_H` for each visible row. Renders only `VISIBLE + 8` rows (buffer above/below viewport). `scrollTop` tracked via `onScroll`. Auto-scrolls to bottom when `atBottom === true`. "Jump to live" button appears when user scrolls up.

ARIA: `role="grid"` on container, `aria-rowcount={events.length}`, `role="row"` + `aria-rowindex` + `aria-selected` on each row. Keyboard: `tabIndex={0}`, `onKeyDown` for Enter/Space to select.

---

## Alternatives Considered

**@tanstack/virtual (useVirtualizer)**: Headless, 3KB gzipped, supports dynamic row heights, correct ARIA. Preferred choice for production. Not used here to keep dependency count minimal and because all rows are fixed height (34px) — the custom implementation handles this case fully with ~60 lines of code.

**react-window**: Requires fixed row height. `VariableSizeList` requires pre-computing heights (impossible for streaming data). `FixedSizeList` doesn't give full control over ARIA structure. Rejected.

**react-virtuoso**: Good ARIA support, but 8KB gzipped and opinionated about DOM structure. Overkill for fixed-height rows. Rejected.

---

## Consequences

- **Positive**: Zero additional dependencies.
- **Positive**: Full ARIA control — `aria-rowcount`, `aria-rowindex`, `aria-selected`.
- **Positive**: INP < 200ms at 500 msg/s — only ~30 DOM nodes regardless of total event count.
- **Negative**: Dynamic row heights (multi-line stack traces) not supported. If needed, migrate to @tanstack/virtual.

---

## References

- `src/app/t/[tenant]/s/[service]/LiveTailShell.js` — `VirtualList` component (lines 60–130)
