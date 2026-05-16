# Security — Threat Model & Mitigations

## 1. XSS (Cross-Site Scripting)

**Threat**: Attacker injects malicious script via log event content (e.g., a log line containing
`<script>alert(1)</script>`), dashboard widget titles, or share-page content.

**Impact**: Session token theft, CSRF token exfiltration, full account takeover.

**Mitigations**:
1. React's JSX escapes all string values by default — no `dangerouslySetInnerHTML` anywhere in the
   codebase. `grep -r "dangerouslySetInnerHTML" src/` must return empty in CI.
2. Log event content is rendered via `<span>{event.message}</span>` — never injected as HTML.
3. Content Security Policy header (set in `next.config.js` headers):
   `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{nonce}'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* wss://*`
   The nonce is generated per request in middleware and injected into all `<Script>` tags.
4. Dashboard widget content is validated against a JSON schema before rendering; any field that
   accepts user text is length-limited to 500 chars.

**Residual risk**: Markdown-rendered fields (widget descriptions) could be a vector if a Markdown
library with HTML passthrough is used. Mitigation: use `remark` with `remark-gfm` only — no HTML
passthrough — and sanitize output with `DOMPurify` before rendering.

---

## 2. CSRF (Cross-Site Request Forgery)

**Threat**: Attacker tricks a logged-in user into visiting a page that makes a state-changing request
to the API (e.g., `POST /api/dashboards` via an `<img>` tag or `<form>`).

**Impact**: Unauthorized dashboard creation/modification, data deletion.

**Mitigations**:
1. Refresh token is in `SameSite=Strict` HttpOnly cookie — not sent on cross-origin requests.
2. All state-changing endpoints require `X-CSRF-Token` header (set in `src/lib/apiClient.ts` on every
   mutation). Header presence alone is sufficient CSRF protection for modern browsers — a cross-origin
   form or img tag cannot set custom headers.
3. Middleware validates `X-CSRF-Token` against the server-side session on every PATCH/POST/DELETE
   (see `src/middleware.ts`, lines 45–62).
4. `Origin` header checked server-side; requests from unexpected origins rejected with 403.

---

## 3. Token Theft

**Threat**: Access token or refresh token is stolen via network interception, XSS, or compromised
browser extension.

**Impact**: Session hijacking; attacker can access the victim's tenants.

**Mitigations**:
1. **Access token**: stored in memory (Zustand) only. Never in localStorage/sessionStorage/cookie.
   Only lives for 5 minutes. Stolen token expires quickly.
2. **Refresh token**: HttpOnly cookie — inaccessible to JavaScript (XSS cannot read it). `Secure`
   flag ensures HTTPS-only transmission.
3. **Refresh token rotation**: every `/api/auth/refresh` call invalidates the previous refresh token
   and issues a new one. If a stolen token is used by an attacker, the legitimate user's next refresh
   will fail (server detects reuse of an invalidated token) and terminates the session.
4. **User-agent binding**: server stores a hash of the User-Agent with the refresh token session.
   Mismatches (attacker using a different browser) are rejected.

---

## 4. Clickjacking

**Threat**: Attacker embeds the app in an `<iframe>` and overlays deceptive UI to trick users into
clicking on sensitive buttons (e.g., deleting a tenant).

**Mitigations**:
1. `X-Frame-Options: DENY` header set in `next.config.js` for all authenticated routes.
2. `Content-Security-Policy: frame-ancestors 'none'` (CSP Level 3 equivalent, takes precedence over
   X-Frame-Options in modern browsers).
3. Exception: `/share/[token]` may legitimately be embedded. For these routes only, CSP is
   `frame-ancestors 'self' https://trusted-embed-origin.com`.

---

## 5. Prototype Pollution

**Threat**: Malicious JSON payload merges `__proto__` or `constructor.prototype` keys into objects,
corrupting the JavaScript prototype chain. Most likely vector: dashboard layout JSON or event filter
payloads.

**Mitigations**:
1. All JSON parsed from external sources (API responses, IndexedDB reads, WebSocket messages) goes
   through a sanitizing parse helper (`src/lib/safeJson.ts`) that uses `JSON.parse(text, (key) => key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value)`.
2. `Object.assign` and spread (`{...obj}`) are used instead of `_.merge` or `$.extend` for all object
   composition. Lodash `_.merge` is explicitly banned via ESLint rule `no-restricted-imports` for the
   `lodash/merge` import.
3. `Object.freeze(Object.prototype)` is called once in `src/lib/security/freezePrototype.ts` on
   application startup (dev + production) to make prototype pollution fail loudly.
4. Dependency audit: `npm audit` runs in CI. Any high/critical vulnerability blocks the build.

---

## 6. Dependency Supply Chain

**Threat**: A compromised npm package (transitive or direct) injects malicious code.

**Mitigations**:
1. **lockfile integrity**: `package-lock.json` is committed and `npm ci` (not `npm install`) is used
   in all CI pipelines. This guarantees reproducible installs from the locked tree.
2. **`npm audit`**: runs on every CI build. High or critical severity vulnerabilities fail the build.
3. **Minimal direct dependencies**: we use 14 direct runtime dependencies (see `package.json`). Every
   new dependency requires a documented rationale in the relevant ADR.
4. **Subresource Integrity (SRI)**: any external script CDN links use `integrity` + `crossorigin`
   attributes. (The app has none in production — all assets are self-hosted.)
5. **Renovate bot**: automated PRs for dependency updates with changelog links. Updates are merged
   after CI passes; major version bumps require manual review.
6. **Socket.dev or Snyk** (optional stretch): integrated into the PR pipeline for malware-pattern
   scanning of new/updated packages.

---

## 7. Summary Matrix

| Threat | Mitigation in code | Severity if exploited |
|---|---|---|
| XSS | React JSX escaping + CSP nonce + no innerHTML | Critical |
| CSRF | SameSite cookie + X-CSRF-Token header + Origin check | High |
| Token theft (access) | Memory-only, 5-min expiry | Low (short window) |
| Token theft (refresh) | HttpOnly + rotation + UA binding | High |
| Clickjacking | X-Frame-Options + CSP frame-ancestors | Medium |
| Prototype pollution | safeJson + freeze + ESLint ban | Medium |
| Supply chain | npm audit + lockfile + Renovate | High |
