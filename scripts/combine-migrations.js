#!/usr/bin/env node

/**
 * Combine Security Migrations
 * 
 * This script combines all security migrations (009, 010, 011) into a single SQL file
 * that can be easily executed in Supabase SQL Editor.
 * 
 * Usage:
 *   node scripts/combine-migrations.js
 * 
 * Output:
 *   supabase/migrations/combined_security_migrations.sql
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const migrations = [
    'supabase/migrations/009_email_verification.sql',
    'supabase/migrations/010_mfa_system.sql',
    'supabase/migrations/011_unified_auth_roles.sql'
];

const outputFile = join(projectRoot, 'supabase/migrations/combined_security_migrations.sql');

console.log('🔗 Combining security migrations...\n');

let combinedSQL = `-- =====================================================
-- COMBINED SECURITY MIGRATIONS
-- =====================================================
-- This file contains all security-related migrations (009, 010, 011)
-- Run this entire file in Supabase SQL Editor
-- =====================================================
-- Generated: ${new Date().toISOString()}
-- =====================================================

`;

let allExist = true;

for (let i = 0; i < migrations.length; i++) {
    const migration = migrations[i];
    const filePath = join(projectRoot, migration);
    
    if (existsSync(filePath)) {
        console.log(`✅ [${i + 1}/${migrations.length}] ${migration}`);
        const sql = readFileSync(filePath, 'utf8');
        
        combinedSQL += `\n-- =====================================================\n`;
        combinedSQL += `-- MIGRATION ${i + 1}: ${migration}\n`;
        combinedSQL += `-- =====================================================\n\n`;
        combinedSQL += sql;
        combinedSQL += `\n\n`;
    } else {
        console.log(`❌ [${i + 1}/${migrations.length}] ${migration} (NOT FOUND)`);
        allExist = false;
    }
}

if (!allExist) {
    console.error('\n❌ Some migration files are missing. Cannot create combined file.');
    process.exit(1);
}

writeFileSync(outputFile, combinedSQL, 'utf8');

console.log(`\n✅ Combined migration file created: ${outputFile}`);
console.log('\n📝 To execute:');
console.log('   1. Go to https://app.supabase.com');
console.log('   2. Select your project');
console.log('   3. Go to SQL Editor');
console.log('   4. Click "New Query"');
console.log('   5. Open the combined file and copy all contents');
console.log('   6. Paste into SQL Editor');
console.log('   7. Click "Run" (or Cmd/Ctrl + Enter)');
console.log('\n✨ All migrations will run in order automatically!\n');
