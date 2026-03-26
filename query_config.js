import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://nnqokhqennuxalamnvps.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ucW9raHFlbm51eGFsYW1udnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzcwMDYsImV4cCI6MjA4MjAxMzAwNn0.hH9XR_tgi4Xl8nS__iHwiSkwjHUvwF88491q4O27cis');

async function getActiveSeasonConfig() {
  const { data, error } = await supabase
    .from('season_configs')
    .select('config_data')
    .eq('is_active', true)
    .single();

  if (error) {
    console.error("Failed", error);
  } else {
    console.log(JSON.stringify(data.config_data, null, 2));
  }
}

getActiveSeasonConfig();
