// Connectivity smoke test for the Firebase backend.
// Usage: node test-firebase.js   (needs .env with VITE_FIREBASE_* values; Node 20.6+)
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

// Parse .env manually (same approach as the old test-supabase.js)
const envPath = path.resolve(import.meta.dirname || '.', '.env');
const env = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
}

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

if (!config.apiKey || !config.projectId) {
  console.error('Missing VITE_FIREBASE_* values in .env — see FIREBASE_SETUP.md.');
  process.exit(1);
}

console.log('Connecting to Firebase project:', config.projectId);
const db = getFirestore(initializeApp(config));

async function run() {
  const ref = doc(db, 'cadet_locations', '__connectivity_probe__');
  try {
    await setDoc(ref, {
      dispatcher_id: 'probe',
      name: 'PROBE',
      latitude: 49.0342,
      longitude: -57.5955,
      status: 'active',
      updated_at: serverTimestamp(),
    });
    const snap = await getDoc(ref);
    console.log('Success! Probe document:', snap.exists() ? snap.data() : '(missing)');
    await deleteDoc(ref);
    console.log('Probe cleaned up.');
  } catch (err) {
    console.error('Firestore error:', err.message);
    console.error('(If "Missing or insufficient permissions", deploy firestore.rules first.)');
  }
}
run();
