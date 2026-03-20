#!/usr/bin/env node

/**
 * Delete 10 Hour Training Package Receipt
 * * This script deletes the receipt from the database and reports the number of rows deleted.
 * * Requirements:
 * - VITE_SUPABASE_URL in .env
 * - SUPABASE_DB_PASSWORD in .env
 */

import dotenv from 'dotenv';
dotenv.config();

// Try to import pg (PostgreSQL client)
let pg;
try {
 pg = await import('pg');
} catch (error) {
 console.error('❌ Error: "pg" package not found');
 console.error('Install it with: npm install pg');
 process.exit(1);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;

if (!supabaseUrl) {
 console.error('❌ Error: VITE_SUPABASE_URL not found in .env');
 process.exit(1);
}

if (!dbPassword) {
 console.error('❌ Error: SUPABASE_DB_PASSWORD not found in .env');
 process.exit(1);
}

// Extract project details from URL
const urlMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
if (!urlMatch) {
 console.error('❌ Error: Invalid Supabase URL format');
 process.exit(1);
}

const projectRef = urlMatch[1];
const dbHost = `db.${projectRef}.supabase.co`;
const dbPort = 5432;
const dbName = 'postgres';
const dbUser = 'postgres';

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
 console.log('🔌 Connecting to database...');
 await client.connect();
 console.log('✅ Connected successfully\n');

 // First, check the schema
 console.log('📋 Checking receipts table schema...');
 const schemaResult = await client.query(`
 SELECT column_name, data_type
 FROM information_schema.columns
 WHERE table_schema = 'public'
 AND table_name = 'receipts'
 ORDER BY ordinal_position;
 `);
 console.log('\nReceipts table columns:');
 schemaResult.rows.forEach(row => {
 console.log(` - ${row.column_name}: ${row.data_type}`);
 });

 // Execute DELETE query
 console.log('\n🗑️ Deleting receipt...');
 const deleteResult = await client.query(`
 BEGIN;
 DELETE FROM receipts
 WHERE items::text ILIKE '%10 Hour Training Package%'
 AND items::text ILIKE '%850%';
 COMMIT;
 `);

 // Get the number of rows deleted
 // Note: PostgreSQL DELETE returns rowCount
 const rowsDeleted = deleteResult.rowCount || 0;
 console.log(`\n✅ rows deleted = ${rowsDeleted}`);

} catch (error) {
 console.error(`\n❌ Error: ${error.message}`);
 if (error.code === '28P01') {
 console.error('⚠️ Authentication failed. Check your database password.');
 } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
 console.error('⚠️ Connection failed. Check your Supabase URL and network connection.');
 }
 process.exit(1);
} finally {
 await client.end();
}
