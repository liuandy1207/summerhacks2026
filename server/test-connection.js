// Run with: node server/test-connection.js
// Bypasses the whole app — inserts one test row and reads it back, to prove
// whether the problem is Supabase credentials/network or app logic.
require('dotenv').config();
console.log('SUPABASE_URL from .env:', process.env.SUPABASE_URL);
console.log('SERVICE_ROLE_KEY starts with:', (process.env.SUPABASE_SERVICE_ROLE_KEY || '').slice(0, 12));

const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const testId = 'test_' + Date.now();
  console.log('\nInserting test row into users table, id =', testId);
  const { data: inserted, error: insErr } = await db
    .from('users')
    .insert({ id: testId, created_at: new Date().toISOString() })
    .select();
  console.log('Insert result:', { inserted, insErr });

  console.log('\nReading it back...');
  const { data: read, error: readErr } = await db.from('users').select('*').eq('id', testId);
  console.log('Read result:', { read, readErr });
})();