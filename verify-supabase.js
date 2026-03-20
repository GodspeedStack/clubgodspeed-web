import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
 console.error('Missing Supabase URL or Anon Key')
 process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function verifyConnection() {
 console.log('Verifying Supabase connection...')
 try {
 // Try to fetch a public table (categories) which is RLS-public
 // Note: If table doesn't exist, this might fail with a specific error
 const { data, error } = await supabase.from('categories').select('count', { count: 'exact', head: true })

 if (error) {
 if (error.code === '42P01') {
 console.log('✅ Connection Successful! (Tables not found, which is expected before migration)')
 console.log('Action Required: Please run the SQL in `supabase/full_schema.sql` via the Supabase Dashboard SQL Editor.')
 } else {
 console.error('❌ Connection failed:', error.message)
 }
 } else {
 console.log('✅ Connection Successful! (Tables exist)')
 }
 } catch (err) {
 console.error('❌ Unexpected error:', err)
 }
}

verifyConnection()
