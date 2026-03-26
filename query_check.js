import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nnqokhqennuxalamnvps.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ucW9raHFlbm51eGFsYW1udnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzcwMDYsImV4cCI6MjA4MjAxMzAwNn0.hH9XR_tgi4Xl8nS__iHwiSkwjHUvwF88491q4O27cis'
const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data: athletes } = await supabase.from('athletes').select('*')
  console.log('Athletes:', athletes)
}
check()
