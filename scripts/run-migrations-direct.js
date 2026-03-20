#!/usr/bin/env node

/**
 * Run Security Migrations Directly
 * 
 * This script executes migrations by connecting directly to the Supabase database.
 * 
 * Requirements:
 *   - VITE_SUPABASE_URL in .env
 *   - SUPABASE_DB_PASSWORD in .env (your database password from Supabase project settings)
 * 
 * Usage:
 *   node scripts/run-migrations-direct.js
 * 
 * Note: This requires the 'pg' package. Install with: npm install pg
 */

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
    },
    {
        file: 'supabase/migrations/010_mfa_system.sql',
        name: 'MFA/2FA System',
    },
    {
        file: 'supabase/migrations/011_unified_auth_roles.sql',
        name: 'Unified Auth & Roles',
    }
];

async function runMigrations() {
    log('\n=== Security Migrations Executor ===\n', 'cyan');

    // Check for required environment variables
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const dbPassword = process.env.SUPABASE_DB_PASSWORD;

    if (!supabaseUrl) {
        log('❌ Error: VITE_SUPABASE_URL not found in .env', 'red');
        process.exit(1);
    }

    // Extract project details from URL
    // URL format: https://xxxxx.supabase.co
    const urlMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (!urlMatch) {
        log('❌ Error: Invalid Supabase URL format', 'red');
        process.exit(1);
    }

    const projectRef = urlMatch[1];
    const dbHost = `db.${projectRef}.supabase.co`;
    const dbPort = 5432;
    const dbName = 'postgres';
    const dbUser = 'postgres';

    log(`✅ Found Supabase URL: ${supabaseUrl}`, 'green');
    log(`✅ Project Ref: ${projectRef}`, 'green');

    if (!dbPassword) {
        log('\n⚠️  SUPABASE_DB_PASSWORD not found in .env', 'yellow');
        log('\nTo get your database password:', 'cyan');
        log('  1. Go to https://app.supabase.com', 'yellow');
        log('  2. Select your project', 'yellow');
        log('  3. Go to Settings → Database', 'yellow');
        log('  4. Copy the database password (or reset it if needed)', 'yellow');
        log('  5. Add to .env: SUPABASE_DB_PASSWORD=your-password', 'yellow');
        log('\nAlternatively, you can run migrations manually in Supabase SQL Editor:', 'cyan');
        log('  1. Go to SQL Editor in Supabase Dashboard', 'yellow');
        log('  2. Copy/paste each migration file content', 'yellow');
        log('  3. Click "Run"', 'yellow');
        process.exit(1);
    }

    // Try to import pg (PostgreSQL client)
    let pg;
    try {
        pg = await import('pg');
    } catch (error) {
        log('\n❌ Error: "pg" package not found', 'red');
        log('\nInstall it with:', 'yellow');
        log('  npm install pg', 'cyan');
        log('\nOr run migrations manually in Supabase SQL Editor', 'yellow');
        process.exit(1);
    }

    // Create database connection
    const client = new pg.Client({
        host: dbHost,
        port: dbPort,
        database: dbName,
        user: dbUser,
        password: dbPassword,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        log('\n🔌 Connecting to database...', 'cyan');
        await client.connect();
        log('✅ Connected successfully\n', 'green');

        // Verify migration files exist
        log('📋 Checking migration files...\n', 'cyan');
        for (const migration of migrations) {
            const filePath = join(projectRoot, migration.file);
            if (existsSync(filePath)) {
                log(`   ✅ ${migration.file}`, 'green');
            } else {
                log(`   ❌ ${migration.file} (NOT FOUND)`, 'red');
                throw new Error(`Migration file not found: ${migration.file}`);
            }
        }

        // Execute migrations
        log('\n🚀 Executing migrations...\n', 'cyan');

        for (let i = 0; i < migrations.length; i++) {
            const migration = migrations[i];
            const filePath = join(projectRoot, migration.file);
            
            log(`[${i + 1}/${migrations.length}] ${migration.name}`, 'blue');
            log(`   File: ${migration.file}`, 'cyan');
            
            try {
                const sql = readFileSync(filePath, 'utf8');
                
                log(`   Executing SQL...`, 'yellow');
                await client.query(sql);
                
                log(`   ✅ ${migration.name} completed`, 'green');
            } catch (error) {
                log(`   ❌ Error: ${error.message}`, 'red');
                throw error;
            }
            
            log(''); // Empty line between migrations
        }

        log('✅ All migrations completed successfully!', 'green');
        log('\n📝 Next steps:', 'cyan');
        log('   1. Verify tables in Supabase Dashboard → Table Editor', 'yellow');
        log('   2. Test features using docs/SECURITY_SETUP_CHECKLIST.md', 'yellow');

    } catch (error) {
        log(`\n❌ Error: ${error.message}`, 'red');
        if (error.code === '28P01') {
            log('\n⚠️  Authentication failed. Check your database password.', 'yellow');
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            log('\n⚠️  Connection failed. Check your Supabase URL and network connection.', 'yellow');
        }
        process.exit(1);
    } finally {
        await client.end();
    }
}

// Run migrations
runMigrations().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});
