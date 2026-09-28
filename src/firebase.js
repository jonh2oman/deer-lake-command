// Firebase initialization for Deer Lake Command.
// ---------------------------------------------------------------------------
// Fill in your project's values via a local `.env` file (see `.env.example`).
// The app runs in a degraded "offline" mode (firebaseReady === false) when
// the config is missing, exactly like the old Supabase client did.
//
//   VITE_FIREBASE_API_KEY=...
//   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
//   VITE_FIREBASE_PROJECT_ID=your-project
//   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
//   VITE_FIREBASE_MESSAGING_SENDER_ID=...
//   VITE_FIREBASE_APP_ID=...
// ---------------------------------------------------------------------------
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'YOUR_PROJECT.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'YOUR_PROJECT.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'YOUR_SENDER_ID',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'YOUR_APP_ID',
};

// True only when a real project config was provided at build time.
export const firebaseReady = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID
);

let db = null;
let auth = null;

if (firebaseReady) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} else {
  console.warn(
    '[firebase] VITE_FIREBASE_* env vars missing — running offline. ' +
    'See FIREBASE_SETUP.md to configure.'
  );
}

export { db, auth };
