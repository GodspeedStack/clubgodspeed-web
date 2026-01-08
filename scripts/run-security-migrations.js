#!/usr/bin/env node

/**
 * Security Migrations Runner
 * 
 * This script helps you run the security-related database migrations (009, 010, 011).
 * 
 * It will:
 * 1. Check if Supabase CLI is installed and use it if available
 * 2. Otherwise, provide clear instructions for manual execution
 * 
 * Usage:
 *   node scripts/run-security-migrations.js
 * 
 * Requirements:
 *   - VITE_SUPABASE_URL in .env
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

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

function checkSupabaseCLI() {
    try {
        execSync('which supabase', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function getProjectRef() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) return null;
    
    // Extract project ref from URL: https://xxxxx.supabase.co -> xxxxx
    const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    return match ? match[1] : null;
}

async function runMigrations() {
    log('\n=== Security Migrations Runner ===\n', 'cyan');

    // Check for required environment variables
    const supabaseUrl = process.env.VITE_SUPABASE_URL;

    if (!supabaseUrl) {
        log('❌ Error: VITE_SUPABASE_URL not found in .env', 'red');
        log('\nPlease add to your .env file:', 'yellow');
        log('  VITE_SUPABASE_URL=https://your-project.supabase.co', 'yellow');
        process.exit(1);
    }

    log(`✅ Found Supabase URL: ${supabaseUrl}\n`, 'green');

    // Verify migration files exist
    log('📋 Checking migration files...\n', 'cyan');
    let allFilesExist = true;
    
    migrations.forEach((migration, i) => {
        const filePath = join(projectRoot, migration.file);
        if (existsSync(filePath)) {
            log(`   ✅ [${i + 1}/${migrations.length}] ${migration.file}`, 'green');
        } else {
            log(`   ❌ [${i + 1}/${migrations.length}] ${migration.file} (NOT FOUND)`, 'red');
            allFilesExist = false;
        }
    });

    if (!allFilesExist) {
        log('\n❌ Some migration files are missing. Please check the file paths.', 'red');
        process.exit(1);
    }

    // Check for Supabase CLI
    const hasCLI = checkSupabaseCLI();
    
    if (hasCLI) {
        log('\n✅ Supabase CLI detected!', 'green');
        log('\n📝 To run migrations with CLI:', 'yellow');
        log('   1. Link your project (if not already):', 'cyan');
        const projectRef = getProjectRef();
        if (projectRef) {
            log(`      supabase link --project-ref ${projectRef}`, 'magenta');
        } else {
            log('      supabase link', 'magenta');
        }
        log('   2. Push migrations:', 'cyan');
        log('      supabase db push', 'magenta');
        log('\n   Or run migrations individually:', 'yellow');
        migrations.forEach((m, i) => {
            log(`      supabase db execute -f ${m.file}`, 'magenta');
        });
    } else {
        log('\n💡 Supabase CLI not installed.', 'yellow');
        log('   Install it for easier migration management:', 'yellow');
        log('   npm install -g supabase', 'magenta');
    }

    // Provide manual instructions
    log('\n📝 Manual Execution (SQL Editor):', 'cyan');
    log('   1. Go to https://app.supabase.com', 'yellow');
    log('   2. Select your project', 'yellow');
    log('   3. Go to SQL Editor (left sidebar)', 'yellow');
    log('   4. Click "New Query"', 'yellow');
    log('   5. Run each migration file IN ORDER:\n', 'yellow');
    
    migrations.forEach((migration, i) => {
        const filePath = join(projectRoot, migration.file);
        const sql = readFileSync(filePath, 'utf8');
        const lineCount = sql.split('\n').length;
        
        log(`   [${i + 1}/${migrations.length}] ${migration.name}`, 'blue');
        log(`      File: ${migration.file}`, 'cyan');
        log(`      Description: ${migration.description}`, 'cyan');
        log(`      Lines: ${lineCount}`, 'cyan');
        log(`      Steps:`, 'cyan');
        log(`        1. Open: ${migration.file}`, 'magenta');
        log(`        2. Copy ALL contents`, 'magenta');
        log(`        3. Paste into SQL Editor`, 'magenta');
        log(`        4. Click "Run" (or Cmd/Ctrl + Enter)`, 'magenta');
        log(`        5. Wait for "Success" ✅\n`, 'magenta');
    });

    log('✅ All migration files are ready!', 'green');
    log('\n⚠️  Important: Run migrations in order (009 → 010 → 011)', 'yellow');
    log('   Each migration builds on the previous one.\n', 'yellow');

    process.exit(0);
}

// Run migrations
runMigrations().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});
