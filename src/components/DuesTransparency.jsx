import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import './DuesTransparency.css'

let envUrl = import.meta.env.VITE_SUPABASE_URL;
let envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!envUrl || envUrl.includes('your_supabase')) {
  envUrl = 'https://nnqokhqennuxalamnvps.supabase.co';
}
if (!envKey || envKey.includes('your_supabase')) {
  envKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ucW9raHFlbm51eGFsYW1udnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzcwMDYsImV4cCI6MjA4MjAxMzAwNn0.hH9XR_tgi4Xl8nS__iHwiSkwjHUvwF88491q4O27cis';
}
const supabaseUrl = envUrl;
const supabaseKey = envKey;
const supabase = createClient(supabaseUrl, supabaseKey);

const DEMO_CONFIG = {
  season: '2026 Spring AAU',
  is_active: true,
  season_fee: 1533,
  due_date: '2026-03-15T00:00:00Z',
  total_families: 20,
  program_cost: 30660,
  fundraise_goal: 30660,
  teams: [
    { grade: '4th', count: 1 },
    { grade: '5th', count: 1 }
  ],
  tournaments: [
    { name: 'Hoop Group Showcase', fee_4th: 445, fee_5th: 445 },
    { name: 'Zero Gravity Regionals', fee_4th: 395, fee_5th: 395 },
    { name: 'Boys & Girls Club Classic', fee_4th: 250, fee_5th: 250 },
    { name: 'The Circuit Finals', fee_4th: 495, fee_5th: 495 },
    { name: 'NXT GEN Mayhem', fee_4th: 350, fee_5th: 350 },
    { name: 'Local Showdown', fee_4th: 225, fee_5th: 225 }
  ],
  gym_sessions: [
    { label: 'Spring Gym Rental (3x/week)', cost: 3500 },
    { label: 'Summer Gym Rental (2x/week)', cost: 2800 }
  ],
  timeline: [
    { month: 'March', desc: 'Tryouts and roster finalization. Uniforms ordered.' },
    { month: 'April', desc: 'Practices begin. First two local tournaments.' },
    { month: 'May', desc: 'Peak tournament season. Regional travel.' },
    { month: 'June', desc: 'Summer training sessions and championship events.' }
  ],
  notes: [
    'All tournament entry fees are divided equally among registered players.',
    'Gym costs cover premium hardwood courts with professional cleaning.'
  ]
};

export function DuesTransparency() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isDemoData, setIsDemoData] = useState(false)
  const [hoveredSeg, setHoveredSeg] = useState(null)

  useEffect(() => {
    async function load() {
      const isDemo = new URLSearchParams(window.location.search).get('demo') === 'true';

      if (isDemo) {
        setConfig(DEMO_CONFIG);
        setIsDemoData(true);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('season_config')
        .select('*')
        .eq('is_active', true)
        .single()

      if (error) {
        console.warn("Supabase fetch failed, falling back to demo config:", error.message);
        setConfig(DEMO_CONFIG);
        setIsDemoData(true);
        setLoading(false);
        return
      }

      setConfig(data)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="dues-loading">Loading configuration…</div>

  const {
    season,
    season_fee,
    due_date,
    total_families,
    program_cost,
    teams,
    tournaments,
    gym_sessions
  } = config

  const tourney4Total = tournaments.reduce((s, t) => s + t.fee_4th, 0)
  const tourney5Total = tournaments.reduce((s, t) => s + t.fee_5th, 0)
  
  const formattedDue = new Date(due_date).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  })

  // Calculate segment exact costs per family
  const t4 = Math.round(tourney4Total / total_families)
  const t5 = Math.round(tourney5Total / total_families)
  const gymSpring = gym_sessions.length > 0 ? Math.round(gym_sessions[0].cost / total_families) : 0
  const gymSummer = gym_sessions.length > 1 ? Math.round(gym_sessions[1].cost / total_families) : 0
  
  // Calculate the remainder surplus exactly based on the declared season fee
  const surplus = season_fee - (t4 + t5 + gymSpring + gymSummer)

  const segments = [
    { id: 't4', label: '4th Grade Tourneys', amount: t4, color: '#185FA5', desc: `Covers entry fees for ${tournaments.length} premium tournaments.` },
    { id: 't5', label: '5th Grade Tourneys', amount: t5, color: '#10B981', desc: `Covers entry fees for ${tournaments.length} premium tournaments.` },
    { id: 'gs', label: 'Spring Gym', amount: gymSpring, color: '#8B5CF6', desc: 'Premium hardwood rental 3x/week.' },
    { id: 'gsu', label: 'Summer Gym', amount: gymSummer, color: '#F59E0B', desc: 'Summer training facility costs.' },
    { id: 'surplus', label: 'Fall Surplus', amount: surplus, color: '#F43F5E', desc: 'Rolled over into the fall season fund.' },
  ].filter(s => s.amount > 0)

  return (
    <div className="dues-transparency">

      {isDemoData && (
        <div className="dues-demo-badge">
          <div className="dues-demo-dot" />
          Fallback Demo Data (RLS Fix Pending)
        </div>
      )}

      {/* Divider */}
      <div className="dues-divider">
        <span>TRANSPARENCY</span>
      </div>

      {/* Stats Line */}
      <div className="dues-stat-grid">
        <div className="dues-stat">
          <div className="dues-stat-label">Season Fee</div>
          <div className="dues-stat-value">${season_fee.toLocaleString()}</div>
          <div className="dues-stat-sub">Due {formattedDue}</div>
        </div>
        <div className="dues-stat">
          <div className="dues-stat-label">Players</div>
          <div className="dues-stat-value">{total_families}</div>
          <div className="dues-stat-sub">{teams.map(t => `${t.count}× ${t.grade}`).join(' · ')}</div>
        </div>
        <div className="dues-stat">
          <div className="dues-stat-label">Tournaments</div>
          <div className="dues-stat-value">{tournaments.length * 2}</div>
          <div className="dues-stat-sub">Across {season}</div>
        </div>
      </div>

      {/* Apple-Style Beautiful Progress Bar */}
      <div className="dues-viz-container">
        <div className="dues-viz-title">Where your ${season_fee} goes</div>
        <div className="dues-viz-subtitle">Hover over segments or cards below to isolate costs. Every dollar is accounted for.</div>

        <div className="pb-wrapper">
          {segments.map(seg => (
            <div
              key={seg.id}
              className="pb-segment"
              style={{
                width: `${(seg.amount / season_fee) * 100}%`,
                background: seg.color,
                opacity: hoveredSeg === null || hoveredSeg === seg.id ? 1 : 0.2
              }}
              onMouseEnter={() => setHoveredSeg(seg.id)}
              onMouseLeave={() => setHoveredSeg(null)}
            />
          ))}
        </div>

        <div className="pb-tags">
          {segments.map(seg => (
            <div
              key={seg.id}
              className={`pb-tag ${hoveredSeg === seg.id ? 'active' : ''}`}
              onMouseEnter={() => setHoveredSeg(seg.id)}
              onMouseLeave={() => setHoveredSeg(null)}
            >
              <div className="pb-dot" style={{ background: seg.color }} />
              {seg.label}
            </div>
          ))}
        </div>

        {/* Masonry Metrics Cards Instead of Boring ChartJS */}
        <div className="glass-grid">
          {segments.map(seg => (
            <div
              key={seg.id}
              className="glass-card"
              onMouseEnter={() => setHoveredSeg(seg.id)}
              onMouseLeave={() => setHoveredSeg(null)}
              style={{
                transform: hoveredSeg === seg.id ? 'translateY(-4px)' : 'none',
                borderColor: hoveredSeg === seg.id ? 'rgba(24,95,165,0.2)' : 'rgba(255,255,255,0.5)'
              }}
            >
              <div className="gc-header">
                <div className="gc-icon-wrapper" style={{ background: seg.color }}>
                  $
                </div>
                <div className="gc-title">{seg.label}</div>
              </div>
              <div className="gc-amount">${seg.amount.toLocaleString()}</div>
              <div className="gc-desc">{seg.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* The Big Objective Metric at end */}
      <div className="goal-gauge-container">
        <div className="goal-gauge-badge">The Master Objective</div>
        <div className="goal-gauge-title">Fundraising Target</div>
        <div className="goal-gauge-amount">${program_cost.toLocaleString()}</div>
        <div style={{ maxWidth: 500, lineHeight: 1.6, color: 'rgba(255,255,255,0.8)' }}>
          To run a premium facility and travel program for {total_families} players, breaking even requires over $30k. Even if zero families pay dues this season, our fundraiser ensures 100% of these program costs are completely covered. That is Godspeed.
        </div>
      </div>
    </div>
  )
}
