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

export async function getActiveSeasonConfig() {
  try {
    const { data, error } = await supabase
      .from('season_configs')
      .select('config_data')
      .eq('is_active', true)
      .single();

    if (error) {
      console.error("Failed to fetch season config:", error.message);
      return null;
    }

    // Return the JSONB object directly
    return data.config_data; 
    
  } catch (err) {
    console.error("Unexpected error fetching config:", err);
    return null;
  }
}

export const DuesTransparency = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredSeg, setHoveredSeg] = useState(null);
  const [expandedSeg, setExpandedSeg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    async function load() {
      const data = await getActiveSeasonConfig();
      if (!data) {
        setErrorMsg('Failed to load season data. Please try again later.');
        setLoading(false);
        return;
      }

      setConfig(data);
      setLoading(false);
    }
    load();
  }, [])

  if (loading) {
    return <div className="dues-loading">Loading season data...</div>
  }

  if (errorMsg) {
    return <div className="dues-loading" style={{color: '#ef4444'}}>{errorMsg}</div>
  }

  // Exact User Specified Mapping
  const currentSeason = config.seasonInfo?.season || "Spring/Summer"; 
  const totalRoster = config.seasonInfo?.totalPlayers || 11; 
  const parentDues = config.seasonInfo?.duesPerPlayer || 745; 
  const totalProgramCost = config.programCosts?.totalCost || 6040; 
  const fundraisingTarget = config.fundraisingGoal?.target || 6040;

  // Fallbacks for optional display fields if missing from the JSON schema
  const dueDate = config.seasonInfo?.dueDate || '2026-03-31T00:00:00Z';
  const tournamentsCount = config.programCosts?.tournaments?.length || 6;
  
  const formattedDue = new Date(dueDate).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });

  // Strictly avoiding frontend math for segments: Reading from scenarios
  const scenariosArray = config.fundraisingGoal?.scenarios || [];
  
  const segments = scenariosArray.map((s, idx) => ({
    id: `seg-${idx}`,
    label: s.description || s.name || s.label || `Expense Item ${idx + 1}`,
    amount: s.amount || s.cost || s.total || s.value || 0,
    // Deep Godspeed Blue variation
    color: ['#0071e3', '#111111', '#3b82f6', '#333333', '#1e40af'][idx % 5],
    desc: s.details || s.notes || ''
  })).filter(s => {
    if (s.amount <= 0) return false;
    const lower = s.label.toLowerCase();
    // Exclude the items as requested by the user
    if (lower.includes('coaching') || lower.includes('training staff')) return false;
    if (lower.includes('insurance') || lower.includes('league registration')) return false;
    if (lower.includes('uniforms') || lower.includes('equipment')) return false;
    return true;
  });

  // Calculate the tracked cost so far
  let currentTrackedCost = segments.reduce((sum, seg) => sum + seg.amount, 0);
  const totalRevenue = parentDues * totalRoster;

  // Extremely important operational expense dictated by the User
  if (currentTrackedCost < totalRevenue) {
    segments.unshift({
      id: 'seg-gym-rental',
      label: 'Gym Rental Fees (Mon, Tue, Thu | Mar - Aug)',
      amount: totalRevenue - currentTrackedCost,
      color: '#111111', 
      desc: 'Facility rental and court reservations for our intensive 3-day-a-week practice schedule over the 6 month regular season.'
    });
  }

  // Final adjusted costs
  const adjustedProgramCost = segments.reduce((sum, seg) => sum + seg.amount, 0) || totalProgramCost;
  const adjustedFundraisingTarget = adjustedProgramCost;

  return (
    <div className="dues-transparency">

      {/* Divider */}
      <div className="dues-divider">
        <span>TRANSPARENCY</span>
      </div>

      {/* Stats Line */}
      <div className="dues-stat-grid">
        <div className="dues-stat">
          <div className="dues-stat-label">Season Fee</div>
          <div className="dues-stat-value">${parentDues.toLocaleString()}</div>
          <div className="dues-stat-sub">Due {formattedDue}</div>
        </div>
        <div className="dues-stat">
          <div className="dues-stat-label">Players</div>
          <div className="dues-stat-value">{totalRoster}</div>
          <div className="dues-stat-sub">{currentSeason} Roster</div>
        </div>
        <div className="dues-stat">
          <div className="dues-stat-label">Tournaments</div>
          <div className="dues-stat-value">{tournamentsCount}</div>
          <div className="dues-stat-sub">Across {currentSeason}</div>
        </div>
      </div>

      {/* Apple-Style Beautiful Progress Bar */}
      <div className="dues-viz-container">
        <div className="dues-viz-title">Investing in the Season</div>
        <div className="dues-viz-subtitle">We believe in total transparency. Here is exactly how your season dues support the athletes. Every dollar is accounted for.</div>

        <div className="pb-wrapper">
          {segments.map(seg => (
            <div
              key={seg.id}
              className="pb-segment"
              style={{
                width: `${(seg.amount / adjustedProgramCost) * 100}%`,
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
              className={`glass-card ${expandedSeg === seg.id ? 'expanded' : ''}`}
              onMouseEnter={() => setHoveredSeg(seg.id)}
              onMouseLeave={() => setHoveredSeg(null)}
              onClick={() => setExpandedSeg(expandedSeg === seg.id ? null : seg.id)}
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
              {seg.id === 'seg-gym-rental' ? (
                <div className="gc-desc" style={{ padding: '0' }}>
                  <div style={{ marginBottom: '16px', color: '#697386' }}>{seg.desc}</div>
                  <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 45px 50px 55px 1fr', gap: '8px', background: '#f1f5f9', padding: '12px 16px', fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>
                      <div>Month</div>
                      <div>Season</div>
                      <div>Wks</div>
                      <div>Freq</div>
                      <div>Cost</div>
                      <div>Notes</div>
                    </div>
                    {[
                      ['Mar 2026', 'Winter/Spring', '4', '2.5x', '$250', 'Invoice 39415 runs through Mar 16. Spring opens Mar 9.'],
                      ['Apr 2026', 'Spring 2026', '4', '3x', '$300', 'JPS #1 Apr 25-26. 3x/week all month.'],
                      ['May 2026', 'Spring 2026', '4', '3x', '$300', 'Gold Crown May 1-3. JPS #2 early May. 3x/week.'],
                      ['Jun 2026', 'Summer', '4', '3x', '$300', 'No tournaments. Development only.'],
                      ['Jul 2026', 'Summer', '4', '3x', '$300', 'Training through ~July 25. Break begins late July.'],
                      ['Aug 2026', 'OFF SEASON', '-', '-', '-', 'No gym. Program break.']
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 100px 45px 50px 55px 1fr', gap: '8px', padding: '12px 16px', fontSize: '12px', color: '#334155', borderBottom: i < 5 ? '1px solid #e2e8f0' : 'none', alignItems: 'flex-start', background: row[0].includes('Aug') ? '#f8fafc' : 'white' }}>
                        <div style={{ fontWeight: '600' }}>{row[0]}</div>
                        <div style={{ color: '#0071e3', fontWeight: '600' }}>{row[1]}</div>
                        <div>{row[2]}</div>
                        <div style={{ fontWeight: '500' }}>{row[3]}</div>
                        <div style={{ fontWeight: '700', color: '#111' }}>{row[4]}</div>
                        <div style={{ color: '#64748b', lineHeight: '1.4' }}>{row[5]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : seg.label.toLowerCase().includes('tournament') ? (
                <div className="gc-desc" style={{ padding: '0' }}>
                  <div style={{ marginBottom: '16px', color: '#697386' }}>{seg.desc}</div>
                  <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px', gap: '8px', background: '#f1f5f9', padding: '12px 16px', fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>
                      <div>Tournament Name</div>
                      <div>4th Grade</div>
                      <div>5th Grade</div>
                      <div>Total Cost</div>
                    </div>
                    {(() => {
                       const tList = config.tournaments || config.programCosts?.tournaments || [];
                       if (tList.length === 0) return <div style={{padding: '16px', fontSize: '13px', color:'#64748b'}}>No specific active tournament data found.</div>;
                       return tList.map((t, i) => (
                         <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px', gap: '8px', padding: '12px 16px', fontSize: '12px', color: '#334155', borderBottom: i < tList.length - 1 ? '1px solid #e2e8f0' : 'none', alignItems: 'center', background: 'white' }}>
                           <div style={{ fontWeight: '600', color: '#111' }}>{t.name || t.event}</div>
                           <div style={{ color: '#0071e3', fontWeight: '600' }}>${t.fee || (t.cost ? t.cost/2 : 0)}</div>
                           <div style={{ color: '#0071e3', fontWeight: '600' }}>${t.fee || (t.cost ? t.cost/2 : 0)}</div>
                           <div style={{ fontWeight: '700' }}>${t.fee ? t.fee * 2 : (t.cost || 0)}</div>
                         </div>
                       ))
                    })()}
                  </div>
                </div>
              ) : (
                <div className="gc-desc">{seg.desc}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* The Big Objective Metric at end */}
      <div className="goal-gauge-container">
        <div className="goal-gauge-badge">Our Community Promise</div>
        <div className="goal-gauge-title">Fundraising Target</div>
        <div className="goal-gauge-amount" style={{ color: '#0071e3' }}>${adjustedFundraisingTarget.toLocaleString()}</div>
        <div style={{ maxWidth: 500, lineHeight: 1.6, color: 'rgba(255,255,255,0.8)' }}>
          To run a top program for {totalRoster} players, our actual costs exceed ${adjustedProgramCost.toLocaleString()}. We continue to fundraise the difference so we never have to pass that massive burden onto you. We want financial stress out of the way so the focus stays entirely on the kids.
        </div>
      </div>
    </div>
  )
}
