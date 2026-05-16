# ADR-006: Authentication & Session Architecture

**Status**: Accepted  
**Date**: 2025-01  

---

## Context

Assignment requires: HttpOnly cookies for refresh token, CSRF protection on writes, silent refresh surviving tab visibility changes and offline reconnects, 5-min access token / 7-day refresh token rotation.

---

## Decision

**Access token**: Short-lived JWT (5 min) stored in React Context memory only. Never in localStorage, sessionStorage, or any cookie. Cleared on component unmount / page close.

**Refresh token**: HttpOnly, Secure, SameSite=Strict cookie. Sent automatically by browser on `/api/auth/refresh`. Server rotates on every use (refresh token rotation — invalidates stolen tokens).

**CSRF**: `X-CSRF-Token` header on all mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`). Token stored in a non-HttpOnly cookie (readable by JS; this is the standard CSRF double-submit cookie pattern). Checked in Next.js Edge Middleware for all state-changing requests.

**Silent refresh** (`src/store/auth.js`):
- Schedules refresh 60s before token expiry via `setTimeout`
- `visibilitychange` → `visible`: re-triggers refresh if token expired while tab was hidden
- `online` event: re-triggers refresh after offline period before replaying queued writes

---

## Alternatives Considered

**Access token in a cookie**: Would require CSRF protection on reads too. No security benefit for short-lived tokens. Rejected.

**next-auth**: Adds abstraction over a simple custom auth server. Hides the implementation detail the assignment is evaluating. Rejected.

**Token in localStorage**: Accessible to XSS. Any injected script can read it. HttpOnly cookie for refresh token + memory-only access token is the correct pattern. Rejected.

---

## Consequences

- **Positive**: Access token never touches persistent storage → XSS can't steal session across page loads.
- **Positive**: Refresh token rotation means a stolen token is invalidated on next legitimate use.
- **Negative**: Access token lost on page refresh — silent refresh restores session, but there is a brief loading state.
- **Negative**: Multi-tab coordination not implemented (BroadcastChannel) — see TRADEOFFS.md.

---

## References

- `src/store/auth.js` — AuthProvider, silent refresh
- `src/middleware.js` — CSRF check + auth guard
- `mock/server.js` — `/api/auth/login`, `/api/auth/refresh` with token rotation
