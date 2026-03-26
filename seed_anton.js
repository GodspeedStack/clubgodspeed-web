const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://nnqokhqennuxalamnvps.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ucW9raHFlbm51eGFsYW1udnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzcwMDYsImV4cCI6MjA4MjAxMzAwNn0.hH9XR_tgi4Xl8nS__iHwiSkwjHUvwF88491q4O27cis'
const supabase = createClient(supabaseUrl, supabaseKey)

async function seed() {
  try {
      // Login as Coach to bypass Parent RLS restrictions for inserting data
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
          email: 'denisblyakhman@gmail.com',
          password: 'demo123'
      })
      if (authErr) throw authErr;
      
      console.log('Logged in as coach successfully.')

      // Now query Anton's profile
      const { data: profiles, error: pErr } = await supabase.from('profiles').select('*').eq('email', 'anton@example.com')
      if (pErr) throw pErr;
      if (!profiles || profiles.length === 0) throw new Error("Anton profile not found.");
      const user_id = profiles[0].id

      let { data: accounts, error: aErr } = await supabase.from('parent_accounts').select('*').eq('user_id', user_id)
      if (aErr) throw aErr;
      
      let parent_account_id
      if (!accounts || accounts.length === 0) {
          const res = await supabase.from('parent_accounts').insert({ user_id, primary_email: 'anton@example.com', parent_name_1: 'Anton Parent' }).select()
          if (res.error) throw res.error;
          parent_account_id = res.data[0].id
      } else {
          parent_account_id = accounts[0].id
      }

      // Check if athlete already exists
      let { data: existingAthletes } = await supabase.from('athletes').select('*').eq('parent_account_id', parent_account_id);
      let athlete_id;
      
      if (existingAthletes && existingAthletes.length > 0) {
          athlete_id = existingAthletes[0].id;
          console.log('Athlete already exists:', athlete_id);
      } else {
          // Insert athlete
          let { data: athletes, error: athErr } = await supabase.from('athletes').insert({
              parent_account_id,
              first_name: 'LeBron',
              last_name: 'James Jr.',
              team_name: 'Godspeed Varsity',
              season: '2026 Spring/Summer',
              grade: '8th',
              enrollment_status: 'active'
          }).select()
          if (athErr) throw athErr;
          athlete_id = athletes[0].id
          console.log('Inserted Athlete ID:', athlete_id)
      }

      // Insert Game
      let { data: games, error: gErr } = await supabase.from('games').insert({
          game_date: '2026-03-24',
          game_type: 'tournament',
          opponent_name: 'Elevation Flyers',
          team_score: 65,
          opponent_score: 60,
          season: '2026 Spring/Summer',
          is_home: true
      }).select()
      if (gErr) throw gErr;
      const game_id = games[0].id

      // Insert Game Stats
      const statRes = await supabase.from('player_game_stats').insert({
          game_id,
          athlete_id,
          minutes_played: 28,
          points: 24,
          assists: 8,
          defensive_rebounds: 5,
          offensive_rebounds: 2,
          steals: 3,
          blocks: 1,
          turnovers: 2,
          coach_notes: 'Great vision in transition.'
      })
      if (statRes.error) throw statRes.error;

      // Insert Evaluation
      const evRes = await supabase.from('player_evaluations').insert({
          athlete_id,
          season: '2026 Spring/Summer',
          ball_handling: 8,
          shooting_form: 7,
          mid_range: 8,
          three_point: 6,
          free_throw: 7,
          finishing: 9,
          passing: 8,
          court_vision: 9,
          defensive_stance: 7,
          effort: 9,
          coachability: 10,
          strengths: 'Elite transition finisher and court vision. High motor.',
          areas_to_improve: 'Weak-side defensive rotations and consistent 3PT release point.',
          coach_comments: 'Anton has taken a huge leap this season. He is dictating the pace of the game. If he tightens his defensive rotations, he will be unstoppable.'
      })
      if (evRes.error) throw evRes.error;

      // Insert Training Session
      let { data: session, error: sessErr } = await supabase.from('training_sessions').insert({
          session_date: '2026-03-25',
          session_type: 'team_practice',
          title: 'Defensive Rotations Focus',
          season: '2026 Spring/Summer'
      }).select()
      if (sessErr) throw sessErr;

      // Insert Attendance
      const attRes = await supabase.from('training_attendance').insert({
          session_id: session[0].id,
          athlete_id,
          status: 'present',
          effort_rating: 4,
          coach_notes: 'Much better on closeouts today.'
      })
      if (attRes.error) throw attRes.error;

      console.log('Seeded data for Anton successfully.')
  } catch (err) {
      console.error('SEEDING ERROR:', err)
  }
}
seed()
