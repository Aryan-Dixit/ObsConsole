# REVIEW.md — Code Review Exercise

---

## File 1: `review/useInfiniteFeed.ts`

A custom hook combining `fetch` with `IntersectionObserver` for infinite scroll.

---

### Issue 1 — Race condition on rapid scroll (Correctness / Race condition)
**Line**: ~35–52 (the `fetchNextPage` function inside the intersection callback)

**Problem**: The `IntersectionObserver` callback is not gated on `isLoading`. If the user scrolls
the sentinel into view multiple times before the first fetch resolves (possible during fast scroll),
`fetchNextPage` is called multiple times in parallel. Each call reads the current `cursor` value,
which hasn't updated yet (the previous fetch hasn't settled), so every parallel call fetches the same
page, causing duplicate entries in the feed.

**Impact**: Duplicate items rendered in the list; extra API calls wasting bandwidth; potential state
corruption if items have non-stable keys.

**Fix**:
```typescript
// Add a ref guard — refs don't trigger re-renders
const isFetchingRef = useRef(false);

const fetchNextPage = useCallback(async () => {
  if (isFetchingRef.current || !cursor) return;
  isFetchingRef.current = true;
  try {
    const data = await fetch(`/api/feed?cursor=${cursor}`).then(r => r.json());
    setItems(prev => [...prev, ...data.items]);
    setCursor(data.nextCursor);
  } finally {
    isFetchingRef.current = false;
  }
}, [cursor]);
```
A `useRef` guard (not `useState`) avoids the re-render that would cause the observer to briefly
re-fire during the loading state update.

---

### Issue 2 — Observer never disconnected (Memory leak)
**Line**: ~18–28 (the `useEffect` that creates the `IntersectionObserver`)

**Problem**: The cleanup function returned from `useEffect` calls `observer.disconnect()`, but only
if `sentinelRef.current` exists at cleanup time. However, the `observe(sentinelRef.current)` call
is inside the same effect without checking that the sentinel exists. If the sentinel unmounts and
remounts (common in React Strict Mode double-invocation, or component re-mounting), a new observer
is created but the previous one's `disconnect` runs against a null ref — leaving the old observer
alive and observing a detached DOM node indefinitely.

**Impact**: Memory leak; ghost observers fire their callback on the detached node; potential
`setState` calls after unmount (React will warn about this).

**Fix**:
```typescript
useEffect(() => {
  const sentinel = sentinelRef.current;
  if (!sentinel) return;

  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) fetchNextPage();
  }, { rootMargin: '200px' });

  observer.observe(sentinel);

  return () => {
    observer.unobserve(sentinel);
    observer.disconnect();
  };
}, [fetchNextPage]); // fetchNextPage must be stable (useCallback)
```
Capture the sentinel in a local variable at effect setup time — the closure is stable even if the
ref changes later.

---

### Issue 3 — Stale closure over `cursor` (Correctness)
**Line**: ~40 (reference to `cursor` inside `fetchNextPage` without it in the dependency array)

**Problem**: `fetchNextPage` is defined inside the component body but `cursor` is read from a stale
closure if `fetchNextPage` is not in a `useCallback` with `cursor` as a dependency. After the first
page loads and `cursor` updates, the observer callback still holds the old `fetchNextPage` reference
— so page 3 fetches with page 1's cursor.

**Fix**: Wrap `fetchNextPage` in `useCallback([cursor])` and include it in the observer effect's
dependency array (as shown above). This ensures the observer always uses the latest cursor.

---

### Issue 4 — No AbortController on fetch (Correctness / Performance)
**Line**: ~38 (the `fetch` call)

**Problem**: If the component unmounts while a fetch is in-flight (e.g., user navigates away), the
fetch still resolves and calls `setItems` on the unmounted component. React 18 will not warn about
this but it still wastes bandwidth and can cause state leaks in unusual cases.

**Fix**:
```typescript
const abortRef = useRef<AbortController | null>(null);

const fetchNextPage = useCallback(async () => {
  abortRef.current?.abort();
  const ac = new AbortController();
  abortRef.current = ac;
  const data = await fetch(`/api/feed?cursor=${cursor}`, { signal: ac.signal }).then(r => r.json());
  // ... rest
}, [cursor]);

// In cleanup:
return () => { abortRef.current?.abort(); };
```

---

### Issue 5 — Accessibility gap (Accessibility)
**Line**: ~65–80 (the rendered sentinel div and list)

**Problem**: The sentinel `<div>` at the bottom of the list has no accessible meaning. Screen reader
users get no indication that more content is loading or available. A keyboard user has no way to
trigger pagination (they can't scroll programmatically with a keyboard easily).

**Fix**:
- Add a `<button>` with `aria-label="Load more"` as a fallback alongside the auto-loading sentinel
- Announce loading state: `<div aria-live="polite" aria-atomic="true">{isLoading ? 'Loading more items...' : ''}</div>`
- The sentinel itself: `<div role="status" aria-hidden="true" ref={sentinelRef} />`

---

## File 2: `review/AuthProvider.tsx`

Context-based auth provider with token refresh.

---

### Issue 1 — Token stored in context state (Security)
**Line**: ~20 (the `useState<string | null>` for `accessToken`)

**Problem**: Storing the access token in React context state means it lives in the component tree
and is accessible to any component that consumes the context. More critically, context state is
serialised into React DevTools in development, potentially exposing tokens in developer tooling.
In production builds this is less of an issue, but it also means token values are in a predictable
memory location that browser extensions could enumerate.

**Impact**: Token exposure via React DevTools; extension-based exfiltration.

**Fix**: Store the token in a module-level variable or a `useRef` (not visible in DevTools), and
expose only derived state (`isAuthenticated: boolean`, `userId: string`). Token is accessed via a
`getToken()` function, not stored in context.

---

### Issue 2 — Refresh on every render (Performance / Correctness)
**Line**: ~45–60 (`useEffect` with `[accessToken]` dependency that schedules refresh)

**Problem**: The refresh `setTimeout` is scheduled inside a `useEffect` that depends on `accessToken`.
If any parent component re-renders causing `AuthProvider` to re-render, and `accessToken` is a new
string value with the same content (e.g., created via `jwt.sign` returning a new string), the effect
will re-fire and schedule a duplicate refresh timer without clearing the previous one.

**Impact**: Multiple simultaneous refresh requests; one will succeed and rotate the refresh token,
making the other's refresh token invalid, logging the user out unexpectedly.

**Fix**: Use `clearTimeout` in the cleanup and ensure the token value is compared by decoded expiry,
not by reference:
```typescript
useEffect(() => {
  if (!accessToken) return;
  const { exp } = jwtDecode(accessToken);
  const msUntilRefresh = (exp * 1000) - Date.now() - 60_000;
  if (msUntilRefresh <= 0) { refresh(); return; }
  const id = setTimeout(refresh, msUntilRefresh);
  return () => clearTimeout(id);
}, [accessToken]); // accessToken value is stable (same JWT string = same reference)
```

---

### Issue 3 — No Broadcast Channel for multi-tab (Correctness)
**Line**: N/A (missing feature)

**Problem**: If the user has the app open in two tabs, each tab independently holds its own access
token and schedules its own refresh. When Tab A refreshes and rotates the refresh token, Tab B's
next refresh attempt will fail with 401 (the refresh token it holds is now invalid). This logs the
user out of Tab B.

**Fix**: Use `BroadcastChannel` to synchronise token rotation:
```typescript
const bc = new BroadcastChannel('auth');
bc.onmessage = (e) => {
  if (e.data.type === 'TOKEN_ROTATED') setAccessToken(e.data.token);
};
// After successful refresh:
bc.postMessage({ type: 'TOKEN_ROTATED', token: newToken });
```

---

### Issue 4 — Race condition: simultaneous refresh calls (Correctness / Race condition)
**Line**: ~55 (the `refresh` function)

**Problem**: If two concurrent requests receive a 401 (access token expired), both will call
`refresh()` simultaneously. The first will succeed and rotate the refresh token. The second will
send the now-invalid old refresh token and receive a 401, logging the user out.

**Fix**: Use a module-level promise to deduplicate in-flight refresh calls:
```typescript
let refreshPromise: Promise<string> | null = null;

async function refresh(): Promise<string> {
  if (refreshPromise) return refreshPromise; // reuse in-flight refresh
  refreshPromise = doRefreshRequest().finally(() => { refreshPromise = null; });
  return refreshPromise;
}
```

---

### Issue 5 — CSRF token not included on refresh call (Security)
**Line**: ~50 (the `fetch('/api/auth/refresh', { method: 'POST' })`)

**Problem**: The refresh endpoint is a state-changing POST request. If CSRF protection is enforced
on all POST requests (as required by our security spec), the refresh call must include the
`X-CSRF-Token` header. The current implementation doesn't include it.

**Fix**: Read the CSRF token from its cookie before making the refresh call:
```typescript
const csrfToken = document.cookie.match(/csrf=([^;]+)/)?.[1];
await fetch('/api/auth/refresh', {
  method: 'POST',
  headers: { 'X-CSRF-Token': csrfToken ?? '' },
  credentials: 'include'
});
```

---

## File 3: `review/EventTable.tsx`

Virtualized table over a WebSocket stream.

---

### Issue 1 — `setState` called in WS `onmessage` directly (Performance / Critical)
**Line**: ~30–40 (the `ws.onmessage` handler that calls `setEvents(prev => [...prev, event])`)

**Problem**: Calling `setState` in every WebSocket message at 50–500 msg/sec schedules 50–500 React
re-renders per second. Each re-render reconciles the entire component subtree. At 500 msg/s, this
creates a render queue that can never drain, blocking the main thread indefinitely and making the
page unresponsive (INP >> 500ms).

**Impact**: Page freeze; browser may show "Unresponsive page" dialog at 500 msg/s.

**Fix**: Batch events via `requestAnimationFrame`:
```typescript
const pendingRef = useRef<Event[]>([]);

useEffect(() => {
  ws.onmessage = (e) => {
    pendingRef.current.push(JSON.parse(e.data));
  };

  const flush = () => {
    if (pendingRef.current.length > 0) {
      const batch = pendingRef.current.splice(0, 200); // max 200 per frame
      setEvents(prev => [...prev, ...batch]);
    }
    rafRef.current = requestAnimationFrame(flush);
  };
  rafRef.current = requestAnimationFrame(flush);

  return () => {
    cancelAnimationFrame(rafRef.current);
    ws.close();
  };
}, []);
```

---

### Issue 2 — Unbounded array growth (Memory leak)
**Line**: ~42 (`setEvents(prev => [...prev, event])`)

**Problem**: The events array grows without bound. At 200 msg/s for 5 minutes, that's 60,000 events
in memory. Each event object is ~200 bytes → ~12MB just for the array, plus React's reconciliation
overhead. After 30 minutes at 200 msg/s it would be ~70MB for events alone. Eventually the tab will
OOM.

**Fix**: Cap the in-memory event array to a maximum (e.g., 100,000 events). When the cap is reached,
evict from the head:
```typescript
setEvents(prev => {
  const combined = [...prev, ...batch];
  return combined.length > MAX_EVENTS
    ? combined.slice(combined.length - MAX_EVENTS)
    : combined;
});
```

---

### Issue 3 — Non-virtualized render of all events (Performance)
**Line**: ~80–95 (the `events.map(event => <tr key={event.id}>...)`)

**Problem**: All events are rendered to the DOM simultaneously. At 1,000 events, this creates 1,000
`<tr>` elements. The browser must lay out and paint all of them. Scroll performance degrades
quadratically with event count.

**Fix**: Use `@tanstack/virtual`'s `useVirtualizer` to render only the ~20–30 rows visible in the
viewport. The rest are represented by a single spacer element.

---

### Issue 4 — Key using array index (Correctness)
**Line**: ~82 (`events.map((event, i) => <tr key={i}>`)`)

**Problem**: Using array index as the React key means that when events are prepended or evicted (head
eviction for memory management), all existing rows get new keys, causing full re-renders of every
visible row on every event arrival.

**Fix**: Use `event.id` (UUID) as the key — guaranteed stable across re-renders.

---

### Issue 5 — WebSocket not closed on reconnect (Correctness / Memory leak)
**Line**: ~25 (the `useEffect` that creates `new WebSocket(url)`)

**Problem**: If the `url` prop changes (e.g., user navigates to a different service), the effect
re-runs and creates a new WebSocket. But if the cleanup function doesn't call `ws.close()` on the
*old* WebSocket captured in the closure, the old connection stays open, sending events into a stale
`setEvents` call.

**Fix**: Ensure the cleanup always closes the specific WebSocket instance captured at effect creation:
```typescript
useEffect(() => {
  const ws = new WebSocket(url);
  ws.onmessage = handleMessage;
  return () => {
    ws.onmessage = null; // prevent stale state updates
    ws.close();
  };
}, [url]); // url change triggers cleanup + re-create
```

---

### Issue 6 — No screen reader support (Accessibility)
**Line**: ~78 (the `<table>` element with no ARIA attributes)

**Problem**: A table rendering live-updating data needs `aria-live` on the region to announce new
events to screen reader users. Without it, screen reader users have no indication that the table is
updating. Additionally, the table has no `<caption>` or `aria-label`, so its purpose is not
announced.

**Fix**:
```tsx
<div role="log" aria-label="Live event stream" aria-live="polite" aria-relevant="additions">
  <table aria-label={`Events for service ${serviceId}`}>
    <caption className="sr-only">Live telemetry events, updating in real time</caption>
    ...
  </table>
</div>
```
Note: `aria-live="polite"` — not `assertive` — to avoid interrupting the user on every event.
Consider only announcing significant events (ERROR/FATAL level) via an assertive live region.
