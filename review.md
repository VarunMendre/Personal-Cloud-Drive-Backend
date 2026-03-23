# Codebase Audit Report (Performance, Security, Logic)

## Scope
Reviewed backend code under `server/` for:
- security vulnerabilities,
- logical/authorization flaws,
- performance and scalability bottlenecks,
- correctness and maintainability issues.

---

## High-priority findings

1. **IDOR on file download endpoint (`getFile`)**
   - `getFile` fetches file by `_id` and returns signed URL without verifying owner/shared access.
   - Impact: any authenticated user who knows/guesses a file ID can access another user’s file metadata/url.
   - Recommendation: enforce `owner || shared` check (or use `file.hasAccess(req.user._id, "viewer")`) before issuing URLs.

2. **Potential privilege bypass in directory creation (`createDirectory`)**
   - Parent directory lookup does not verify `parentDir.userId === req.user._id` before creating a child directory.
   - Impact: authenticated users may create nested data under directories they don’t own.
   - Recommendation: enforce parent ownership/permission check.

3. **Unsafe production fallback for cookie signing secret**
   - App continues with `fallback_secret_for_local_only` if `MY_SECRET_KEY` is missing.
   - Impact: predictable cookie signatures and session tampering risk in misconfigured deployments.
   - Recommendation: fail fast on startup in non-local env if secret is missing.

4. **Denial-of-service route exposed (`/err`)**
   - Public endpoint triggers `process.exit(1)`.
   - Impact: trivial remote process crash.
   - Recommendation: remove route entirely or guard it behind strict internal-only controls.

5. **Webhook signature handling is fragile and non-constant-time**
   - Razorpay signature compares plain strings with `===` and computes HMAC from `JSON.stringify(req.body)` (mutated body risk).
   - Impact: signature verification can fail unpredictably and is not timing-safe.
   - Recommendation: verify against raw request bytes and use `crypto.timingSafeEqual`.

6. **Sanitization is effectively disabled**
   - `sanitize` utility returns input unchanged, while controllers rely on it.
   - Impact: potential input pollution/XSS propagation to downstream consumers/UI, and inconsistent trust boundaries.
   - Recommendation: implement real sanitization/normalization, or remove the abstraction and rely strictly on schema validation + output encoding.

---

## Medium-priority findings

1. **Password length check bug in `setUserPassword`**
   - Uses `newPassword < 4` instead of `newPassword.length < 4`.
   - Impact: logic correctness bug and weaker validation behavior.

2. **`gitHubWebhook` middleware sends response then calls `next()`**
   - Causes double-response risk if reused.
   - Recommendation: return response without calling next after sending.

3. **Redis `KEYS session:*` usage in hot paths**
   - Used in user listing and subscription details.
   - Impact: blocking/slow operations at scale; can degrade Redis latency.
   - Recommendation: query indexed sessions (already partially implemented via RediSearch index) or maintain per-user session sets.

4. **Recursive directory counting causes N+1 query explosions**
   - `getDirectory` and delete traversal recursively call DB per node.
   - Impact: poor performance on deeply nested directories.
   - Recommendation: use aggregation/materialized counters/batched traversal.

5. **Auth middleware places password hash into `req.user`**
   - Unnecessary exposure of credential hash to downstream handlers.
   - Recommendation: remove `password` from `req.user`; use explicit DB query where required.

---

## Low-priority findings

1. **Unused imports / dead code indicators**
   - e.g., `spawn` in `app.js`, `gitHubWebhook` imported but unused.

2. **Minor schema/code hygiene issues**
   - e.g., stray `import { type } from "node:os"` in subscription model.

3. **Inconsistent error status choices**
   - Some auth failures return `404` instead of `401/403`.

---

## Optimization opportunities

1. **Replace full session scans with indexed queries**
   - Use RediSearch index (`userIdInx`) or per-user set (`sessions:user:{id}`).

2. **Cache frequently requested derived values**
   - Dashboard stats, recursive file/folder totals, subscription detail snapshots.

3. **Reduce repeated DB lookups in auth flow**
   - `checkAuth` fetches user + subscription every request; introduce short-lived cache or embed lightweight subscription state in session with periodic refresh.

4. **Move heavy recursive operations to async jobs for large trees**
   - For deletes/stat recalculations, queue work for very large directory structures.

5. **Add key indexes (if absent in DB)**
   - Likely beneficial: `File(userId, parentDirId)`, `Directory(userId, parentDirId)`, `File(sharedWith.userId)`, `Subscription(userId, createdAt)`.

---

## Suggested remediation plan

### Phase 1 (Immediate, 1-2 days)
- Remove `/err` route.
- Enforce strict startup secret requirement in production.
- Fix `getFile` authorization check.
- Fix `createDirectory` parent ownership check.
- Fix password length validation bug.

### Phase 2 (Short-term, 3-7 days)
- Rework Razorpay webhook verification to raw-body + constant-time compare.
- Remove password hash from `req.user`.
- Replace Redis `KEYS` usage with indexed session retrieval.
- Fix `gitHubWebhook` response flow.

### Phase 3 (Hardening & performance, 1-3 weeks)
- Implement real sanitization policy + output encoding guidelines.
- Add stress/load tests for deeply nested directory operations.
- Introduce background jobs for expensive recursive calculations.
- Add security regression tests for IDOR/authorization boundaries.

---

## Test and tooling recommendations
- Add automated security tests for:
  - unauthorized file access by ID,
  - unauthorized directory mutations,
  - webhook signature tampering,
  - role escalation attempts.
- Add lint rules / CI checks for:
  - unused imports,
  - accidental exposure of sensitive fields,
  - dangerous APIs/routes.
- Integrate dependency scanning in CI (SCA) and run `npm audit` where registry access allows.

# Codebase Audit Report (Optimization, Security, Logic)

## Scope
- Repository reviewed: `Personal-Cloud-Drive-Backend`
- Focus areas: security vulnerabilities, authorization flaws, logic bugs, operational risks, and performance/optimization opportunities.

## High-priority findings

### 1) IDOR risk in file download endpoint
**Severity:** Critical  
**Where:** `server/controllers/fileController.js` (`getFile`)  
**Issue:** The endpoint loads a file by `_id` and returns a signed URL/redirect without verifying owner/shared access. Any authenticated user with a valid file ID could potentially access another user’s file.  
**Recommendation:** Enforce access checks (`owner || sharedWith || valid shareLink token`) before issuing signed URLs.

### 2) Parent directory authorization gap during directory creation
**Severity:** High  
**Where:** `server/controllers/directoryController.js` (`createDirectory`)  
**Issue:** Parent directory existence is checked, but ownership is not enforced before creating a subdirectory. This can allow unauthorized folder creation under another user’s directory if ID is known.  
**Recommendation:** Validate `parentDir.userId.toString() === req.user._id.toString()`.

### 3) Weak share-link token generation
**Severity:** High  
**Where:** `server/controllers/shareController.js` (`generateShareLink`)  
**Issue:** Token is generated using `Math.random()`, which is not cryptographically secure.  
**Recommendation:** Use `crypto.randomBytes(...).toString("hex")` or UUIDv4 with sufficient entropy.

### 4) Insecure fallback cookie signing secret
**Severity:** High  
**Where:** `server/app.js`  
**Issue:** Cookie parser uses a fallback secret when `MY_SECRET_KEY` is missing. This is dangerous in misconfigured deployments and weakens session integrity.
**Recommendation:** Fail fast at startup if the secret is missing in non-local environments (or always).

### 5) Raw password hash exposed in request context
**Severity:** Medium-High  
**Where:** `server/middlewares/authMiddleware.js`  
**Issue:** `req.user` includes `password` hash unnecessarily. This increases accidental exposure risk via logs/errors.
**Recommendation:** Remove `password` from `req.user`; query explicit password only where required.

### 6) Password validation bug in set-password flow
**Severity:** Medium  
**Where:** `server/controllers/authController.js` (`setUserPassword`)  
**Issue:** Condition `if (!newPassword || newPassword < 4)` compares string value to number, not length. Very short passwords may pass unexpectedly depending on coercion.
**Recommendation:** Replace with `newPassword.length < 4`.

### 7) Webhook signature verification may be brittle
**Severity:** Medium  
**Where:** `server/controllers/webhookController.js`  
**Issue:** Signature is computed from `JSON.stringify(req.body)`, which can mismatch provider signature if payload formatting differs from raw body bytes.
**Recommendation:** Verify signature against raw request body (`express.raw`) for webhook routes.

## Additional security concerns

1. **Sanitizer is effectively disabled** (`server/utils/sanitizer.js`) and returns input unchanged. Validation exists via Zod, but sanitization is not active for HTML/script-like payloads.
2. **CORS and origin handling** should be reviewed for strictness and environment parity (`server/app.js`).
3. **Webhook processing idempotency** should be hardened to avoid duplicate side-effects on retries (you log events, but ensure strict dedupe keys and idempotent handlers).
4. **Authorization consistency**: some endpoints use owner/shared checks, others rely only on authentication; standardize with reusable `hasAccess` model helpers.

## Performance and optimization opportunities

### 1) N+1 recursion in directory listing
**Where:** `server/controllers/directoryController.js` (`getDirectory`)  
`getRecursiveCounts` performs recursive DB calls per subtree, which can degrade significantly on deep hierarchies.  
**Suggestion:**
- Maintain counters incrementally (`filesCount`, `foldersCount`) per directory on writes, **or**
- Use aggregation pipelines to compute counts in fewer queries.

### 2) Session presence lookup uses `KEYS session:*`
**Where:** `server/controllers/userController.js` (`getAllUsers`)  
`KEYS` is expensive and blocks Redis on large keyspaces.  
**Suggestion:** Use RediSearch index for user sessions (already partially present), or `SCAN` cursor-based iteration.

### 3) Repeated subscription/status lookups per request
**Where:** auth middleware + several controllers  
Potential extra reads on every authenticated request.  
**Suggestion:** Cache frequently-needed fields in session payload (with TTL) and refresh on subscription webhook updates.

### 4) Missing targeted indexes in MongoDB for common access patterns
**Where:** `File`, `Directory`, `Subscription`, `Webhook`, `OTP` models  
**Suggestion:** Add indexes for fields frequently filtered/sorted:
- `File`: `{ userId: 1, parentDirId: 1 }`, `{ "sharedWith.userId": 1 }`, `{ "shareLink.token": 1 }`
- `Directory`: `{ userId: 1, parentDirId: 1 }`, `{ "sharedWith.userId": 1 }`, `{ "shareLink.token": 1 }`
- `Subscription`: `{ userId: 1 }`, `{ razorpaySubscriptionId: 1 }`
- `Webhook`: `{ eventType: 1, createdAt: -1 }`, idempotency key index if available
- `OTP`: TTL index on expiry field

## Reliability & maintainability improvements

1. **Centralize authorization policy** into composable guards/helpers to avoid drift and IDOR regressions.
2. **Use typed API contracts** for req/res payloads (e.g., shared Zod schemas + OpenAPI generation).
3. **Improve error taxonomy** (operational vs programmer errors) and avoid leaking internals in production.
4. **Add security tests**: access-control regression tests for every resource endpoint.
5. **Add webhook contract tests** with sample signed raw payloads.
6. **Add load tests** for recursive directory and share features.

## Suggested action plan (ordered)

1. **Immediate hotfixes (today):**
   - Patch file download authorization.
   - Patch directory creation parent ownership check.
   - Replace share-link token generation with `crypto`-secure tokens.
   - Remove fallback cookie secret and fail on missing env secret.
   - Remove password hash from `req.user`.
   - Fix set-password length validation.

2. **Short term (1–2 sprints):**
   - Introduce centralized permission middleware using `hasAccess` model methods.
   - Add missing DB indexes and monitor query plans.
   - Replace Redis `KEYS` usage.
   - Harden webhook verification using raw-body route.

3. **Mid term:**
   - Refactor recursive directory counting to precomputed metadata/aggregation.
   - Add test suites: authz regression, webhook idempotency, rate-limit behavior.
   - Introduce security checks in CI (dependency scanning + lint rules for insecure random/fallback secrets).

## Quick wins checklist
- [ ] Add authorization check in `getFile`
- [ ] Add ownership check in `createDirectory`
- [ ] Switch share token to `crypto.randomBytes`
- [ ] Remove insecure cookie secret fallback
- [ ] Drop `password` from `req.user`
- [ ] Fix `setUserPassword` validation
- [ ] Replace Redis `KEYS` with `SCAN`/indexed search
- [ ] Add indexes for common query paths
