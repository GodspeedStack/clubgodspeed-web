#!/usr/bin/env node
// run-v2-migrations.js
// Runs v2_01 through v2_05 migrations against your Supabase PostgreSQL database.
// Usage: node scripts/run-v2-migrations.js
// Requires: SUPABASE_DB_PASSWORD env variable (or will prompt)

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const PROJECT_REF = 'nnqokhqennuxalamnvps';
const DB_HOST = `db.${PROJECT_REF}.supabase.co`;
const DB_PORT = 5432;
const DB_NAME = 'postgres';
const DB_USER = 'postgres';

const MIGRATIONS = [
  { file: 'supabase/migrations/v2_01_profiles.sql',       name: '01 — Profiles + is_director()' },
  { file: 'supabase/migrations/v2_02_login_requests.sql', name: '02 — Login Requests + RPCs' },
  { file: 'supabase/migrations/v2_03_payments.sql',       name: '03 — Payments + payment_summary view' },
  { file: 'supabase/migrations/v2_04_content.sql',        name: '04 — Blog Posts + Memos' },
  { file: 'supabase/migrations/v2_05_comms.sql',          name: '05 — Campaigns + campaign_stats view' },
];

const BOOTSTRAP_SQL = `
-- Bootstrap Director account
UPDATE public.profiles
SET role = 'director', approved = true, full_name = 'Scott G.'
WHERE email = 'scott@clubgodspeed.com';
`;

const c = {
  reset:'\x1b[0m', green:'\x1b[32m', red:'\x1b[31m',
  yellow:'\x1b[33m', blue:'\x1b[34m', cyan:'\x1b[36m'
};
const log = (msg, col='reset') => console.log(`${c[col]}${msg}${c.reset}`);

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, ans => { rl.close(); resolve(ans.trim()); });
  });
}

async function main() {
  log('\n╔══════════════════════════════════════╗', 'cyan');
  log('║   Godspeed v2 Migration Runner       ║', 'cyan');
  log('╚══════════════════════════════════════╝\n', 'cyan');
  log(`Project: ${PROJECT_REF}`, 'blue');
  log(`Host:    ${DB_HOST}\n`, 'blue');

  // Get password
  let password = process.env.SUPABASE_DB_PASSWORD || '';
  if (!password) {
    log('💡 Get your DB password from: Supabase Dashboard → Settings → Database → Database Password', 'yellow');
    password = await prompt('Enter your Supabase database password: ');
  }
  if (!password) { log('❌ No password provided. Exiting.', 'red'); process.exit(1); }

  // Try to load pg
  let pg;
  try { pg = await import('pg'); }
  catch {
    log('📦 Installing pg client...', 'yellow');
    const { execSync } = await import('child_process');
    execSync('npm install pg --no-save', { stdio: 'inherit', cwd: root });
    pg = await import('pg');
  }

  const client = new pg.default.Client({
    host: DB_HOST, port: DB_PORT, database: DB_NAME,
    user: DB_USER, password,
    ssl: { rejectUnauthorized: false }
  });

  try {
    log('\n🔌 Connecting to database...', 'cyan');
    await client.connect();
    log('✅ Connected!\n', 'green');

    // Run migrations
    let passed = 0;
    for (let i = 0; i < MIGRATIONS.length; i++) {
      const { file, name } = MIGRATIONS[i];
      const path = join(root, file);
      log(`[${i+1}/${MIGRATIONS.length}] ${name}`, 'blue');
      if (!existsSync(path)) { log(`   ❌ File not found: ${file}`, 'red'); continue; }
      try {
        const sql = readFileSync(path, 'utf8');
        await client.query(sql);
        log(`   ✅ Done\n`, 'green');
        passed++;
      } catch (e) {
        log(`   ⚠️  ${e.message}\n`, 'yellow');
        // Continue — some statements may already exist (idempotency)
      }
    }

    // Bootstrap director
    log('👤 Running director bootstrap...', 'cyan');
    try {
      const res = await client.query(BOOTSTRAP_SQL);
      log(`   ✅ Director account updated (${res.rowCount} row(s) affected)\n`, 'green');
    } catch (e) {
      log(`   ⚠️  Bootstrap: ${e.message}`, 'yellow');
    }

    log(`\n🎉 Done! ${passed}/${MIGRATIONS.length} migrations ran.`, 'green');
    log('→ Visit your Supabase dashboard to confirm tables are created.', 'cyan');
    log('→ Open http://localhost:5173/admin-os.html and log in as scott@clubgodspeed.com\n', 'cyan');

  } catch (e) {
    log(`\n❌ Connection error: ${e.message}`, 'red');
    if (e.code === '28P01') log('Wrong password — check Supabase Dashboard → Settings → Database', 'yellow');
  } finally {
    await client.end();
  }
}

main();
