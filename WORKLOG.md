# WORKLOG.md

## Session 1
**Date**: 2025-01  
**Duration**: ~4h  
**Work**: Initial project setup. Scaffolded Next.js 14 App Router project with TypeScript config, mock Express+WebSocket server, auth routes (login/refresh/logout with HMAC JWT, HttpOnly cookies, CSRF). Implemented RingBuffer class and WebSocketManager with rAF batch flush. Key decision: put ring buffer between WS onmessage and React state to avoid 500 msg/s blocking the main thread.  
**References**: Next.js App Router docs (parallel routes, intercepting routes conventions). Adapted route structure from official docs examples.  
**Deferred**: Dashboard drag-resize (chose simple drag API first), full i18n (scaffolded but not applied to all pages).

## Session 2
**Date**: 2025-01  
**Duration**: ~3h  
**Work**: Built live-tail page (/t/[tenant]/s/[service]) with full accessibility (WCAG 2.2 AA): aria-rowcount, aria-rowindex, aria-selected on grid rows, keyboard navigation (Enter/Space to select), skip link, screen-reader-navigable virtual list. Added backpressure warning banner with aria-live="polite". Level filter buttons use aria-pressed. Search input has associated label.  
**References**: WCAG 2.2 success criteria 2.1.1 (keyboard), 4.1.2 (name/role/value), 1.3.1 (info and relationships).  
**Decisions**: Used window-based virtualization (own impl) rather than @tanstack/virtual to keep dependencies minimal. Trade-off documented in TRADEOFFS.md.

## Session 3
**Date**: 2025-01  
**Duration**: ~3h  
**Work**: Built dashboard editor with undo/redo (50-step history via useReducer pattern), offline IndexedDB queue, conflict resolution UI on 409. Implemented three-layer RBAC (middleware + server guard in RSC layout + client RoleGuard). Built /share/[token] as ISR page. Added next-intl for en/ja i18n; login page fully localized.  
**References**: next-intl docs for App Router integration. idb-keyval for IndexedDB.  
**Decisions**: Used next-intl over custom i18n to get RTL-aware utilities. HttpOnly CSRF pattern from OWASP CSRF cheat sheet.

## Session 4
**Date**: 2025-01  
**Duration**: ~2h  
**Work**: Built /debug/metrics page with live p50/p75/p95 panel. Updated telemetry library to match Section 5.1 exactly: configurable sampling rates, resource timing (10% sample), slow API threshold corrected to 1s. Built three code review files with realistic flawed code. Created WORKLOG, TEMPLATE, grade script.  
**References**: PerformanceObserver resource timing entries MDN docs.  
**Decisions**: Kept slow_api threshold at >1s per assignment (was incorrectly >500ms previously). Resource timing sampled at 10% to avoid bandwidth cost.

## Tools & External References
- Next.js 14 App Router documentation — used for parallel routes, intercepting routes, ISR revalidation patterns. All code written from scratch; docs used for API reference only.
- WCAG 2.2 specification — used as checklist for accessibility requirements.
- web-vitals library README — used for onLCP/onINP/onCLS callback API.
- OWASP CSRF Prevention Cheat Sheet — used for CSRF token pattern (readable cookie + X-CSRF-Token header).
- MDN PerformanceObserver documentation — used for longtask and resource entry types.
