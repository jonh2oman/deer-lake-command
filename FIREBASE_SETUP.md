# Firebase Setup for Deer Lake Command

The app's backend moved from Supabase to **Firebase (Firestore + Firebase Auth)**.
The Leaflet UI is unchanged; only the data layer was rewritten. You do the
one-time Firebase setup below, then the app works as before.

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com/ → **Add project**. Any name works
   (e.g. `deer-lake-command`). Google Analytics is optional.
2. **Firestore Database** → **Create database** → choose **production mode**
   (we deploy our own rules next) → pick the region closest to you
   (`northamerica-northeast1` is Montreal; `us-east1` is also fine).
3. **Authentication** → **Get started** → **Sign-in method** → enable
   **Email/Password**.
4. **Project settings** (gear icon) → **Your apps** → **Web** (`</>`) →
   register the app (nickname `deer-lake-command`). Firebase shows you a
   `firebaseConfig` object — copy the values.

## 2. Deploy the security rules

In the Firebase console go to **Firestore Database → Rules**, paste the entire
contents of `firestore.rules` from this repo, and **Publish**. (Or use the
Firebase CLI: `firebase deploy --only firestore:rules`.)

Read the comments at the top of `firestore.rules` — writes from transmit links
are intentionally public (field transmitters have no accounts), exactly like
the old Supabase setup.

## 3. Configure the app

1. Copy `.env.example` to `.env` and paste the values from step 1:
   ```bash
   cp .env.example .env
   ```
2. Install and run:
   ```bash
   npm install
   npm run dev        # http://localhost:5173/
   npm run build      # production bundle in dist/
   ```
3. Create your dispatcher account: open the app, use the **Register** tab once.
   (Firebase Auth replaces the old Supabase auth — old logins don't transfer;
   everyone re-registers.)
4. Quick check: `node test-firebase.js` writes/reads/deletes a probe document
   (needs the `.env` values; requires Node 20.6+).

## 4. GitHub Pages deployment

The deploy workflow (`.github/workflows/deploy.yml`) needs these repository
**Actions secrets** (Settings → Secrets and variables → Actions → New secret):
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Without them the build succeeds but the app boots to "DATABASE OFFLINE" (this
was also broken on Supabase — now fixed by wiring the secrets through).

## 5. Migrating existing tracking data (optional)

Live positions are ephemeral (a transmitter deletes its blip on stop), so in
most cases you can start fresh. If you need the old rows:

1. In the old Supabase project: **Table Editor → cadet_locations → Export as CSV**
   (or `pg_dump` / the SQL editor `COPY`).
2. Write the rows to Firestore with the Admin SDK (service account key from
   Firebase **Project settings → Service accounts**):
   ```js
   // node import.js (one-off, keep the key file out of git)
   const admin = require('firebase-admin');
   admin.initializeApp({ credential: admin.credential.cert(require('./service-key.json')) });
   const db = admin.firestore();
   for (const row of rows) {
     await db.collection('cadet_locations').doc(row.id).set({
       dispatcher_id: row.dispatcher_id,   // NOTE: old dispatcher_id values are
       name: row.name,                      // Supabase auth UUIDs — they will NOT
       latitude: row.latitude,              // match new Firebase UIDs, so old
       longitude: row.longitude,            // rows won't appear on any dashboard
       status: row.status,                  // until you re-tag dispatcher_id
       accuracy: row.accuracy,              // with the new Firebase UID.
       icon_type: row.icon_type,
       icon_color: row.icon_color,
       party_type: row.party_type,
       party_size: row.party_size,
       updated_at: admin.firestore.FieldValue.serverTimestamp(),
     });
   }
   ```
   Map each old `dispatcher_id` to the dispatcher's **new Firebase UID**
   (Authentication → Users → copy UID) or the rows stay invisible.

## What changed in the code

| Before (Supabase) | After (Firebase) |
|---|---|
| `@supabase/supabase-js` client | `firebase` SDK, initialized in `src/firebase.js` |
| `supabase.auth.*` (sign-up/in/out, session) | `firebase/auth` (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `signOut`, `onAuthStateChanged`) |
| `.channel('public:cadet_locations').on('postgres_changes', …)` | `onSnapshot(query(collection(db,'cadet_locations'), where('dispatcher_id','==',uid)))` with `docChanges()` mapped to INSERT/UPDATE/DELETE |
| `.from('cadet_locations').upsert(payload)` | `setDoc(doc(db,'cadet_locations',deviceId), payload, {merge:true})` |
| `.from('cadet_locations').delete().eq('id', …)` | `deleteDoc(doc(db,'cadet_locations',deviceId))` |
| `updated_at` via Postgres trigger | `serverTimestamp()` on write |
| `supabase_setup.sql` | `firestore.rules` (this file's step 2) |
| `currentUser.id` (auth UUID) | `currentUser.uid` |

Also fixed during migration: stored-XSS escaping on responder names (see
`AUDIT.md`), `.env` removed from git, Google satellite tiles `http→https`,
dead `jsdom` dependency removed.
