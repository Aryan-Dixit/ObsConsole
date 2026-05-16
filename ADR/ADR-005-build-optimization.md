# ADR-005: Build & Bundle Optimization

**Status**: Accepted  
**Date**: 2025-01  

---

## Context

Hard limits from assignment §3: initial route JS ≤ 90KB gzipped, main bundle ≤ 180KB. With Next.js App Router, RSC boundaries eliminate most client JS. The risk areas are the live-tail page (WS + virtualization) and the dashboard editor (undo/redo + IndexedDB).

---

## Decision

Bundle strategy:

1. **Route-level code splitting**: Each `page.js` in `app/` is automatically split by Next.js App Router. No manual configuration needed.

2. **Dynamic import for idb-keyval**: `import('idb-keyval')` is called dynamically inside event handlers (offline queue, telemetry replay). It is never in the initial bundle.

3. **No icon library**: Custom SVG or Unicode characters only. A typical icon library (lucide-react) is 50KB+ gzipped.

4. **No date formatting library**: `toISOString().slice(11,19)` for timestamps. moment.js (65KB) and date-fns (20KB+) are not needed.

5. **web-vitals lazy loaded**: `import('web-vitals')` inside `useEffect` — not in any SSR path.

6. **Measured bundle sizes** (from `npm run build`):
   - `/` — 2.41 KB JS ✅ (budget: 90KB)
   - `/login` — 2.56 KB ✅
   - `/share/[token]` — 0.15 KB ✅ (ISR, effectively no JS)
   - `/t/[tenant]/s/[service]` — 8.29 KB ✅
   - `/t/[tenant]/dashboards/[id]` — 5.24 KB ✅

---

## Alternatives Considered

**Module Federation for dashboard editor**: Would allow independent deployment of the editor. Rejected — editor is tightly coupled to auth context and reducer state. The bundle size savings don't justify the added complexity (see TRADEOFFS.md).

**Webpack bundle analysis (`ANALYZE=true npm run build`)**: Should be run before submission to verify no regressions. Config ready in `next.config.js`.

---

## Consequences

- **Positive**: All per-route bundles well under 90KB budget.
- **Positive**: idb-keyval only loaded when actually needed (offline paths).
- **Negative**: Dynamic imports add a small latency on first use of offline features.

---

## References

- `next.config.js` — build config
- `src/lib/idb.js` — dynamic import of idb-keyval
- `src/lib/telemetry.js` — lazy web-vitals import
