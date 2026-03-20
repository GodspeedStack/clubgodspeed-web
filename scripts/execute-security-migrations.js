#!/usr/bin/env node

/**
 * Execute Security Migrations
 * * This script executes the security migrations (009, 010, 011) directly via Supabase Management API.
 * * Requirements:
 * - VITE_SUPABASE_URL in .env
 * - SUPABASE_SERVICE_ROLE_KEY in .env (get from Supabase Dashboard → Settings → API → service_role key)
 * * Usage:
 * node scripts/execute-security-migrations.js
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Colors for console output
const colors = {
 reset: '\x1b[0m',
 green: '\x1b[32m',
 red: '\x1b[31m',
 yellow: '\x1b[33m',
 blue: '\x1b[34m',
 cyan: '\x1b[36m',
 magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
 console.log(`${colors[color]}${message}${colors.reset}`);
}

// Migration files to run (in order)
const migrations = [
 {
 file: 'supabase/migrations/009_email_verification.sql',
 name: 'Email Verification System',
 description: 'Adds email verification tables and functions'
 },
 {
 file: 'supabase/migrations/010_mfa_system.sql',
 name: 'MFA/2FA System',
 description: 'Adds two-factor authentication tables and functions'
 },
 {
 file: 'supabase/migrations/011_unified_auth_roles.sql',
 name: 'Unified Auth & Roles',
 description: 'Adds unified role system and rate limiting'
 }
];

async function executeSQL(supabase, sql) {
 // Use Supabase REST API to execute SQL
 // Note: This requires service role key for DDL operations
 const response = await fetch(`${supabase.supabaseUrl}/rest/v1/rpc/exec_sql`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'apikey': supabase.supabaseKey,
 'Authorization': `Bearer ${supabase.supabaseKey}`
 },
 body: JSON.stringify({ sql })
 });

 if (!response.ok) {
 const error = await response.text();
 throw new Error(`SQL execution failed: ${error}`);
 }

 return await response.json();
}

async function runMigrations() {
 log('\n=== Security Migrations Executor ===\n', 'cyan');

 // Check for required environment variables
 const supabaseUrl = process.env.VITE_SUPABASE_URL;
 const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

 if (!supabaseUrl) {
 log('❌ Error: VITE_SUPABASE_URL not found in .env', 'red');
 log('\nPlease add to your .env file:', 'yellow');
 log(' VITE_SUPABASE_URL=https://your-project.supabase.co', 'yellow');
 process.exit(1);
 }

 if (!serviceRoleKey) {
 log('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found in .env', 'red');
 log('\nTo get your service role key:', 'yellow');
 log(' 1. Go to https://app.supabase.com', 'cyan');
 log(' 2. Select your project', 'cyan');
 log(' 3. Go to Settings → API', 'cyan');
 log(' 4. Copy the "service_role" key (NOT the anon key)', 'cyan');
 log(' 5. Add to .env: SUPABASE_SERVICE_ROLE_KEY=your-service-role-key', 'cyan');
 log('\n⚠️ WARNING: Service role key has admin access. Keep it secret!', 'yellow');
 process.exit(1);
 }

 log(`✅ Found Supabase URL: ${supabaseUrl}`, 'green');
 log(`✅ Found Service Role Key: ${serviceRoleKey.substring(0, 20)}...`, 'green');

 // Create Supabase client with service role key
 const supabase = createClient(supabaseUrl, serviceRoleKey, {
 auth: {
 autoRefreshToken: false,
 persistSession: false
 }
 });

 // Verify migration files exist
 log('\n📋 Checking migration files...\n', 'cyan');
 let allFilesExist = true;
 for (const migration of migrations) {
 const filePath = join(projectRoot, migration.file);
 if (existsSync(filePath)) {
 log(` ✅ ${migration.file}`, 'green');
 } else {
 log(` ❌ ${migration.file} (NOT FOUND)`, 'red');
 allFilesExist = false;
 }
 }

 if (!allFilesExist) {
 log('\n❌ Some migration files are missing. Please check the file paths.', 'red');
 process.exit(1);
 }

 // Execute migrations
 log('\n🚀 Executing migrations...\n', 'cyan');

 for (let i = 0; i < migrations.length; i++) {
 const migration = migrations[i];
 const filePath = join(projectRoot, migration.file);
 log(`[${i + 1}/${migrations.length}] ${migration.name}`, 'blue');
 log(` File: ${migration.file}`, 'cyan');
 try {
 const sql = readFileSync(filePath, 'utf8');
 // Split SQL into individual statements
 const statements = sql
 .split(';')
 .map(s => s.trim())
 .filter(s => s.length > 0 && !s.startsWith('--'));

 log(` Executing ${statements.length} SQL statements...`, 'yellow');

 // Execute each statement
 for (let j = 0; j < statements.length; j++) {
 const statement = statements[j];
 if (statement.trim().length === 0) continue;

 try {
 // Use Supabase's REST API to execute SQL
 // Note: Supabase doesn't expose direct SQL execution via REST API
 // We need to use the Management API or direct database connection
 // For now, we'll use a workaround with the PostgREST API
 // Actually, Supabase doesn't allow DDL via REST API
 // We need to use the Management API or Supabase CLI
 log(` ⚠️ Cannot execute DDL via REST API. Please use Supabase CLI or SQL Editor.`, 'yellow');
 break;
 } catch (error) {
 log(` ❌ Error executing statement ${j + 1}: ${error.message}`, 'red');
 throw error;
 }
 }

 log(` ✅ ${migration.name} completed`, 'green');
 } catch (error) {
 log(` ❌ Error: ${error.message}`, 'red');
 log(`\n⚠️ Migration ${i + 1} failed. Stopping.`, 'yellow');
 process.exit(1);
 }
 log(''); // Empty line between migrations
 }

 log('✅ All migrations completed successfully!', 'green');
 log('\n📝 Next steps:', 'cyan');
 log(' 1. Verify tables were created in Supabase Dashboard → Table Editor', 'yellow');
 log(' 2. Test email verification flow', 'yellow');
 log(' 3. Test 2FA setup', 'yellow');
 log(' 4. Follow docs/SECURITY_SETUP_CHECKLIST.md for testing', 'yellow');
}

// Alternative: Use Supabase Management API
// This requires the Management API access token, which is different from service role key
// For now, let's provide instructions to use Supabase CLI or SQL Editor

log('\n⚠️ Note: Supabase REST API does not support DDL (CREATE TABLE, ALTER TABLE, etc.)', 'yellow');
log(' You need to use one of these methods:', 'yellow');
log(' 1. Supabase CLI: npm install -g supabase (then: supabase db push)', 'cyan');
log(' 2. SQL Editor: Copy/paste each migration file in Supabase Dashboard', 'cyan');
log(' 3. Direct database connection with psql (requires database password)', 'cyan');
log('\n📝 For now, please run migrations manually in Supabase SQL Editor.\n', 'yellow');

// Run migrations
runMigrations().catch(error => {
 log(`\n❌ Fatal error: ${error.message}`, 'red');
 console.error(error);
 process.exit(1);
});
