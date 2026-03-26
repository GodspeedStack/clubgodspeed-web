import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nnqokhqennuxalamnvps.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ucW9raHFlbm51eGFsYW1udnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzcwMDYsImV4cCI6MjA4MjAxMzAwNn0.hH9XR_tgi4Xl8nS__iHwiSkwjHUvwF88491q4O27cis'
const supabase = createClient(supabaseUrl, supabaseKey)

async function getEvals() {
  const { data, error } = await supabase.from('player_evaluations').select('*, athletes(*)').limit(5)
  console.log(JSON.stringify(data, null, 2), error)
}
getEvals()
