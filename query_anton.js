import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nnqokhqennuxalamnvps.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ucW9raHFlbm51eGFsYW1udnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzcwMDYsImV4cCI6MjA4MjAxMzAwNn0.hH9XR_tgi4Xl8nS__iHwiSkwjHUvwF88491q4O27cis'
const supabase = createClient(supabaseUrl, supabaseKey)

async function getAnton() {
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*').eq('email', 'anton@example.com')
  console.log('Profile:', profiles)
  
  const { data: accounts, error: aErr } = await supabase.from('parent_accounts').select('*').eq('user_id', profiles[0]?.id)
  console.log('Parent Account:', accounts)
  
  const { data: athletes, error: athErr } = await supabase.from('athletes').select('*')
  console.log('All Athletes:', athletes)
}
getAnton()
