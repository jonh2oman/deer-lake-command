# Deer Lake Command — Full Audit (v1.7.0, pre–Firebase migration)

Audited 2026-09-27. Scope: `index.html`, `main.js`, `transmit.html`, `transmit.js`,
`src/`, `vite.config.js`, `supabase_setup.sql`, `.github/workflows/deploy.yml`,
`test-supabase.js`, `package.json`. Secrets were reviewed for *presence only* —
no secret values are recorded in this report.

Severity: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low / quick win

---

## 1. Security

### 🔴 Stored XSS via responder callsign (`main.js`)
The responder's `name` field is free text typed on the public transmit page
(`transmit.js` → `cadetNameInput.value.trim()`), stored in the DB, then
interpolated **unescaped** into HTML on the dispatcher's dashboard:
- `getCadetIcon()` — marker label HTML (lines ~1503, ~1534)
- `handleCadetLocationUpdate()` — Leaflet popup HTML (~1686, ~1707)
- `updateSosMinimap()` — SOS popup HTML (~1619, ~1629)
- `updateCadetsHudList()` — HUD list `innerHTML` (~1597)
- `logToFeed()` — activity feed `innerHTML` (line 379; feed messages embed `name`)

Anyone holding a transmit link (these links are shared out of band, e.g. by
text message) can inject `<img onerror=…>` / `<script>`-equivalent markup that
executes in the dispatcher's browser session — a stored-XSS primitive against
the operator console. **Fixed on the `firebase-migration` branch** via a shared
`escapeHtml()` helper applied at every render sink (data is still stored raw,
escaped at render).

### 🔴 Supabase RLS is intentionally wide open — understand the trust model
`supabase_setup.sql` grants **public** `SELECT / INSERT / UPDATE / DELETE` on
`cadet_locations` (`USING (true)` / `WITH CHECK (true)`). Consequences:
- Anyone with the anon key can read, modify, or delete **every dispatcher's**
  units — there is no ownership check; `dispatcher_id` is a client-supplied
  string, never verified server-side.
- Transmit URLs embed the dispatcher's Supabase auth UUID
  (`transmit.html?dispatcher=<uuid>`). That UUID is a long-lived, un-revocable
  bearer identifier for a dispatcher's board: whoever holds the link can write
  to it, and there is no way to rotate it short of deleting the auth user.
- A malicious client can spam upserts (no rate limiting), inflating Supabase
  realtime fan-out and DB writes.

This matches the product requirement (anonymous field transmitters, no login),
so it is *permissive by design* — but it should be a conscious choice, not an
accident. The Firestore rules shipped on the `firebase-migration` branch
preserve this model (public writes, dispatcher-scoped reads) and flag the
permissive sections explicitly. If the threat model ever tightens, the fix is
short-lived, single-use transmit tokens validated in rules / a Cloud Function.

### 🟠 `.env` is committed to the public repo
`.gitignore` does not list `.env`, and the file (Supabase URL + anon key) is
tracked in git history. The anon key is semi-public by design (it ships in the
client bundle anyway), but committing `.env` sets a trap for the day a service
key gets added. **Fixed on the branch**: `.env` added to `.gitignore`,
untracked via `git rm --cached`, and replaced with a documented `.env.example`.
History still contains the old key — rotate it in the Supabase dashboard.

### 🟠 Stale project reference in `test-supabase.js`
The dev test script falls back to a hardcoded URL for project
`zzxilvfqstqrbpwemsej`, which is **not** the Deer Lake project
(`sxhctoakhnrnyajlbcgq`). Stale credentials / wrong-project writes waiting to
happen. Replaced by `test-firebase.js` on the branch.

### 🟡 Google satellite tiles loaded over `http://`
`MAP_THEMES['google-satellite']` uses `http://mt0.google.com/vt/…`. On an
`https://` deployment (GitHub Pages) this is blocked as mixed content, and
scraping Google tiles violates their ToS. **Fixed on the branch** (`https://`).
Consider dropping the theme or switching to Esri World Imagery (already used
for `satellite`).

### 🟡 No input validation on transmit fields
`party_size` is `parseInt(...)` with no range check (negative / absurd values
accepted); `accuracy` / coordinates are trusted from the client. Low impact
for this app, but a one-line clamp would do.

### 🟢 `user.email` written to the activity feed on login
Minor information exposure in a shared-ops context. Left as-is.

---

## 2. Bugs

### 🔴 GitHub Pages deploy ships a broken app
`.github/workflows/deploy.yml` runs `npm run build` **without injecting any
`VITE_*` secrets**. Vite inlines `import.meta.env` at build time, so the
deployed bundle has `supabaseUrl === undefined` → `supabase === null` → the
app boots to `DATABASE OFFLINE (NO CONNECTION)`. **Fixed on the branch**: the
workflow now passes `VITE_FIREBASE_*` from Actions secrets, and
`FIREBASE_SETUP.md` documents the required repo secrets.

### 🟠 Leaflet CSS linked from `node_modules` in `index.html`
`<link rel="stylesheet" href="node_modules/leaflet/dist/leaflet.css" />` will
404 in the production build (`node_modules` is not deployed; the JS-side
`import 'leaflet/dist/leaflet.css'` already handles styling). Harmless but
should be removed.

### 🟡 Activity feed floods on every position update
`handleCadetLocationUpdate()` calls `logToFeed("SYS: LOCATION UPDATE…")` for
**every** GPS ping (every 4 s per unit). With a handful of units the feed
(only 8 rows visible) becomes unreadable churn, and each update rebuilds
`updateCadetsHudList()` via `innerHTML`. Recommend: log connects/disconnects/
SOS only, throttle or drop per-ping logs.

### 🟡 SOS acknowledge doesn't clear SOS state
`btnSosAck` only hides the modal; the unit keeps broadcasting `status: 'sos'`
until the responder aborts it. Acceptable operationally (dispatcher can't
stand down someone else's emergency), but the modal will re-trigger on the
next update if the status flaps. Consider an ack that suppresses re-alert for
that unit id.

### 🟡 `transmit.js` SOS button silently dead when DB is offline
`btnSos` handler returns early with no user feedback if the backend client is
null. The broadcast button has the same shape but at least the page shows
connection state. Minor.

### 🟢 `handleCadetLocationUpdate` guards `lat === undefined` but DB column is `NOT NULL`
Dead guard; harmless.

### 🟢 `updateSosMinimap` assumes `marker.getPopup()` exists
Only reached for markers created via this path (popup always bound), so safe —
but fragile if refactored.

---

## 3. Performance

- **Six Leaflet maps on one page.** Five secondary minimaps each instantiate
  their own map + tile layers, so every pan/zoom fires ~6× tile requests.
  The minimaps are small and mostly static — consider lazy-initializing them
  when the views panel expands, or rendering them at lower zoom with fewer
  tiles.
- **Canvas graticule per tile.** `CanvasGraticule.createTile` runs
  `map.project()` per grid line per tile; fine at low zoom, but at zoom 18+
  with 0.001° spacing it draws hundreds of lines per tile. Acceptable on
  desktop, heavy on mobile.
- **`updateCadetsHudList()` rebuilds the whole HUD list `innerHTML` on every
  position event.** With N units at 4 s cadence this is O(N) DOM churn at
  ~N/4 Hz. Update-in-place or throttle to ~1 Hz.
- **Realtime fan-out cost.** Every 4 s upsert per transmitter fans out to all
  subscribed dispatchers. Fine at this scale; just be aware it prices with
  usage on Firebase too (document reads per listener per update).

---

## 4. Dead code & cruft

- `src/` is untouched Vite template scaffold (`counter.js`, `src/main.js`,
  `src/style.css`, `src/assets/*`) — not referenced by `index.html` (which
  loads root `main.js`). Delete or leave; it only costs confusion.
- `jsdom` in `dependencies` is never imported. **Removed on the branch.**
- `test-supabase.js` is a dev-only script. Replaced by `test-firebase.js`.
- `main.js` line ~1228: variable named `supaBuoys` actually reads from
  `localStorage` — misleading name, leftover from a Supabase-backed iteration.
- `public/data/Buoys_2.js` / `emergency_3.js` are loaded via `<script>` tags
  in `index.html` (globals), while `waitForDataAndRender` retries on them —
  works, but the retry loop (`retryCount`, ~1358) suggests this was flaky.
  Consider `import`ing them as modules instead.

---

## 5. UX / product notes

- The dispatcher **auth gate hides the entire app** until login; if the backend
  is unreachable the user gets a modal with `DATABASE OFFLINE` and no retry
  path. Add a retry button / status indicator.
- Transmit page in **simulator mode** transmits every 4 s even when the marker
  hasn't moved — fine functionally, wasteful; consider transmitting on change
  only in sim mode.
- No **offline / reconnect indication** on the dashboard beyond feed log lines;
  a dropped realtime channel is silent except `SYS: REAL-TIME LINK STATUS`.
  Firestore's `onSnapshot` error callback is now wired to the feed on the
  branch.
- `transmit.html?dispatcher=` with no/invalid id shows the error card — good.
  But an invalid (non-UUID) id is accepted and writes orphan rows. Harmless
  (dashboard filters by its own id), still noise in the DB.

---

## 6. Architecture (confirmed during audit — relevant to migration)

- Despite the "GIS" name, **no PostGIS types are used**. `cadet_locations`
  stores plain `DOUBLE PRECISION` lat/lng; all geography is client-side Leaflet.
  This makes the Firestore migration a flat document mapping.
- Supabase is used for exactly three things: **Auth** (dispatcher
  email/password), **Realtime** (`postgres_changes` on `cadet_locations`
  filtered by `dispatcher_id`), and **REST CRUD** (upsert/delete from the
  transmit page). All three have direct Firebase equivalents — see
  `FIREBASE_SETUP.md`.
- Tactical deployments (buoys/markers) are **localStorage-only** — they never
  touch the backend and are not shared between operators. If shared tactical
  state is ever wanted, that's a new Firestore collection, not part of this
  migration.

---

## Quick wins applied on `firebase-migration`
1. `escapeHtml()` on all responder-name render sinks (stored-XSS fix).
2. `.env` untracked + `.gitignore`d; `.env.example` added.
3. Google satellite tiles `http://` → `https://`.
4. Deploy workflow injects `VITE_FIREBASE_*` secrets at build time.
5. Unused `jsdom` dependency removed.
6. `test-supabase.js` → `test-firebase.js`.
