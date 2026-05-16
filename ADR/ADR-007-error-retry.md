# ADR-007: Error & Retry Strategy

**Status**: Accepted  
**Date**: 2025-01  

---

## Context

Multiple failure modes: REST API errors, WS disconnections, dashboard 409 conflicts, offline periods. Each requires a different recovery strategy. None should crash the page or block user interaction.

---

## Decision

**REST API errors**:
- 4xx (except 409, 401): shown to user inline as error message. No retry.
- 409 (conflict): immediate optimistic rollback + non-blocking ConflictDialog with three-way diff.
- 401: triggers token refresh, then re-queues the original request.
- Network errors: shown inline with actionable message ("is the mock server running?").

**WebSocket** (`src/lib/wsManager.js`):
- State machine: `IDLE → CONNECTING → OPEN → RECONNECTING → CONNECTING`
- Exponential backoff: 1s → 2s → 4s → ... → 30s max, plus random jitter
- On reconnect: re-subscribes automatically; no manual intervention needed
- Backpressure: ring buffer (5000-slot) + rAF batch flush — never calls `setState` per message

**SSE (alerts stream)**: Native `EventSource` built-in reconnect. If server returns 204, stream ended — stop reconnecting.

**Dashboard offline queue**: Edits while offline written to IndexedDB. Replayed in order on `online` event. If replay hits 409, ConflictDialog shown before continuing.

**Telemetry errors**: All telemetry code wrapped in `try/catch`. Failures silently swallowed — telemetry must never crash the page (assignment §5.1).

---

## Alternatives Considered

**Retry all 4xx**: Would cause infinite loops on 409 (conflict never resolves by retrying). Rejected.

**Exponential backoff for REST**: Only justified for 5xx (server errors). 4xx are client errors — retrying won't help. Rejected.

---

## Consequences

- **Positive**: 409 conflicts handled gracefully with user choice — no data loss.
- **Positive**: WS reconnects automatically with no user action required.
- **Positive**: Telemetry failures are completely invisible to users.
- **Negative**: Offline queue uses IndexedDB — synchronous-looking code becomes async. idb-keyval wrapper helps.

---

## References

- `src/lib/wsManager.js` — WS state machine + exponential backoff
- `src/app/t/[tenant]/dashboards/[id]/DashboardEditor.js` — 409 conflict dialog + offline queue
- `src/lib/telemetry.js` — try/catch everywhere, never re-throws
