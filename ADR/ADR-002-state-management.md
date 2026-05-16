# ADR-002: State Management Library

**Status**: Accepted  
**Date**: 2025-01  

---

## Context

Need client state for: live-tail (high-frequency WS events), dashboard editor (undo/redo history, offline queue, conflict state), auth (token lifecycle), and ephemeral UI state. Must work outside React (WS manager), support TypeScript, and not add significant bundle weight.

---

## Decision

**`useReducer` (built-in React)** for complex local state (live-tail, dashboard editor) + **React Context** for auth + **component state (`useState`)** for simple UI state.

No external state library. Rationale: `useReducer` handles the undo/redo history pattern cleanly (`past[]`, `present`, `future[]`). The live-tail reducer processes WS batch flushes in a single predictable update. Auth state is low-frequency (changes only on login/logout/refresh) — Context is appropriate.

---

## Alternatives Considered

**Zustand**: Minimal boilerplate, works outside React. Rejected because `useReducer` covers all use cases without an additional dependency (3KB). The assignment is evaluated on correctness; adding Zustand would be justified for a larger team but adds no capability here.

**Redux Toolkit**: 40KB+ overhead. Overkill. The slice/action boilerplate adds ~30% more code with no benefit at this scale. Rejected.

**Jotai/Valtio**: Atom-based. Fine for fine-grained updates but undo/redo across multiple atoms simultaneously is awkward (requires atom families or snapshots). Rejected for dashboard editor.

**TanStack Query for server state**: Would benefit the tenant/project list pages (stale-while-revalidate, deduplication). Not used because all data fetching is currently in `useEffect` with manual loading states — acceptable for this scope. Would add as a next step.

---

## Consequences

- **Positive**: Zero additional dependencies for state management.
- **Positive**: `useReducer` + `dispatch` is predictable and easy to test.
- **Negative**: No built-in devtools (vs Redux/Zustand). Debugging relies on React DevTools.
- **Negative**: Auth context causes full subtree re-render on token refresh — acceptable since refreshes are infrequent (every 5 min).

---

## References

- `src/store/auth.js` — Auth context + useReducer
- `src/app/t/[tenant]/s/[service]/LiveTailShell.js` — live-tail useReducer
- `src/app/t/[tenant]/dashboards/[id]/DashboardEditor.js` — dashboard useReducer + undo/redo
