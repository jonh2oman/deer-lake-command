import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env manually
const envPath = path.resolve(import.meta.dirname || '.', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    env[key] = value;
  }
});

const url = env.VITE_SUPABASE_URL || 'https://zzxilvfqstqrbpwemsej.supabase.co';
const key = env.VITE_SUPABASE_ANON_KEY;

console.log("Connecting to:", url);
const supabase = createClient(url, key);

async function run() {
  try {
    const { data, error } = await supabase.from('cadet_locations').select('*').limit(5);
    if (error) {
      console.error("Error querying cadet_locations table:", error.message);
    } else {
      console.log("Success! Query result:", data);
    }
  } catch (err) {
    console.error("Throw error:", err);
  }
}
run();

