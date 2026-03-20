/**
 * Verify Backend Setup
 * Run this in browser console to check if everything is configured
 */

async function verifySetup() {
 console.log('🔍 Verifying Backend Setup...\n');
 const checks = {
 envVars: false,
 supabaseClient: false,
 tables: false,
 auth: false
 };
 // Check environment variables
 console.log('1. Checking environment variables...');
 const supabaseUrl = window.VITE_SUPABASE_URL || '';
 const supabaseKey = window.VITE_SUPABASE_ANON_KEY || '';
 if (supabaseUrl && supabaseKey) {
 console.log(' ✅ Environment variables found');
 checks.envVars = true;
 } else {
 console.log(' ❌ Environment variables missing');
 console.log(' Make sure .env file exists and is loaded');
 return checks;
 }
 // Check Supabase client
 console.log('\n2. Checking Supabase client...');
 const supabase = window.auth?.getSupabaseClient?.();
 if (supabase) {
 console.log(' ✅ Supabase client available');
 checks.supabaseClient = true;
 // Try to query a table
 console.log('\n3. Testing database connection...');
 try {
 const { data, error } = await supabase
 .from('parent_accounts')
 .select('count')
 .limit(1);
 if (error && error.code === 'PGRST116') {
 console.log(' ⚠️ Tables exist but are empty (this is OK)');
 checks.tables = true;
 } else if (error) {
 console.log(' ❌ Database error:', error.message);
 console.log(' Make sure migrations have been run');
 } else {
 console.log(' ✅ Database connection successful');
 checks.tables = true;
 }
 } catch (err) {
 console.log(' ❌ Connection failed:', err.message);
 }
 // Check auth
 console.log('\n4. Checking authentication...');
 try {
 const { data: { session } } = await supabase.auth.getSession();
 if (session) {
 console.log(' ✅ User is logged in');
 checks.auth = true;
 } else {
 console.log(' ℹ️ No active session (login to test)');
 checks.auth = true; // This is OK
 }
 } catch (err) {
 console.log(' ⚠️ Auth check failed:', err.message);
 }
 } else {
 console.log(' ❌ Supabase client not available');
 console.log(' Make sure auth-supabase.js is loaded');
 }
 // Summary
 console.log('\n📊 Setup Summary:');
 console.log(' Environment Variables:', checks.envVars ? '✅' : '❌');
 console.log(' Supabase Client:', checks.supabaseClient ? '✅' : '❌');
 console.log(' Database Tables:', checks.tables ? '✅' : '❌');
 console.log(' Authentication:', checks.auth ? '✅' : '❌');
 const allGood = Object.values(checks).every(v => v === true);
 if (allGood) {
 console.log('\n🎉 Everything looks good! Your backend is ready.');
 } else {
 console.log('\n⚠️ Some checks failed. See details above.');
 console.log('\nNext steps:');
 if (!checks.envVars) {
 console.log(' - Create .env file with Supabase credentials');
 }
 if (!checks.tables) {
 console.log(' - Run database migrations in Supabase SQL Editor');
 }
 }
 return checks;
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
 window.verifySetup = verifySetup;
 console.log('💡 Run verifySetup() to check your setup');
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
 module.exports = verifySetup;
}
