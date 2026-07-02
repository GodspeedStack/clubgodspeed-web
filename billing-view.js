/**
 * billing-view.js — Billing dashboard, payment plans, fundraising credit, Venmo checkout
 * Extracted from parent-portal.js for maintainability.
 * Dependencies: window.auth (auth-supabase.js), escapeHTML (parent-portal.js)
 */
(function () {
'use strict';

/**
 * Resolve enrollment data: total_owed and total_paid from parent_dues_enrollment.
 * Falls back to hardcoded $745 / $0 if no enrollment record exists.
 */
async function resolveEnrollmentData(supabase, userId) {
  var result = { totalOwed: 745, totalPaid: 0 };
  try {
    var resp = await supabase
      .from('parent_player_links')
      .select('athlete_id')
      .eq('profile_id', userId)
      .limit(1);
    var links = resp.data;
    if (!links || !links.length) return result;

    var enr = await supabase
      .from('parent_dues_enrollment')
      .select('total_owed, total_paid')
      .eq('athlete_id', links[0].athlete_id)
      .order('total_paid', { ascending: false })
      .limit(1);
    if (enr.data && enr.data.length) {
      enr.data = enr.data[0];
    }
    if (enr.data) {
      result.totalOwed = parseFloat(enr.data.total_owed) || 745;
      result.totalPaid = parseFloat(enr.data.total_paid) || 0;
    }
  } catch (e) { console.warn('Enrollment lookup:', e); }
  return result;
}

/**
 * Render Billing Dashboard
 */
window.renderBilling = async function (email) {
    const container = document.getElementById('billing-invoices-list');
    const totalDueEl = document.getElementById('billing-total-due');
    const statusTextEl = document.getElementById('billing-status-text');
    const statusCard = document.getElementById('billing-status-card');

    if (!container) return;
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Loading your billing details...</div>';
    loadBillingTrainingSchedule();

    try {
        if (!window.auth || !window.auth.isSupabaseAvailable()) {
            console.warn("Supabase not available. Rendering demo billing UI.");
            handleDemoBilling(container, totalDueEl, statusTextEl, statusCard);
            return;
        }

        const supabase = window.auth.getSupabaseClient();
        const { data: { session }, error: authError } = await supabase.auth.getSession();

        // Fallback for demo mode if not truly authenticated
        if (!session || authError) {
            console.log("No valid Supabase session. Rendering demo billing.");
            handleDemoBilling(container, totalDueEl, statusTextEl, statusCard);
            return;
        }

        const user = session.user;

        // 0a. Dues-exempt accounts never see billing (defense in depth; nav is also hidden).
        try {
            const flags = window.getAccountVisibilityFlags ? await window.getAccountVisibilityFlags() : null;
            if (flags && flags.is_dues_exempt) {
                window.__duesExempt = true;
                const navBilling = document.getElementById('nav-aau-billing');
                if (navBilling) navBilling.style.setProperty('display', 'none', 'important');
                if (typeof window.switchPortalView === 'function') {
                    window.switchPortalView('documents', null);
                }
                return;
            }
        } catch (e) { console.warn('[billing] exemption check failed:', e && e.message); }

        // 0. Resolve actual dues from enrollment table (replaces hardcoded $745)
        const enrollment = await resolveEnrollmentData(supabase, user.id);
        const baseDues = enrollment.totalOwed;
        const paidSoFar = enrollment.totalPaid;

        // 1. Fetch Payment Plan
        const { data: plans, error: plansError } = await supabase
            .from('payment_plans')
            .select('*')
            .eq('parent_id', user.id);

        if (plansError) throw plansError;

        // Helper: update the section header label above billing-invoices-list
        const sectionHeaderEl = document.querySelector('#view-aau-billing h3');

        if (!plans || plans.length === 0) {
            // No plan selected yet — show plan selection UI
            statusTextEl.textContent = 'Action Required';
            statusTextEl.style.color = '#ef4444';
            statusCard.style.borderLeftColor = '#ef4444';
            if (sectionHeaderEl) sectionHeaderEl.textContent = 'Payment Plan';
            await renderPlanSelectionUI(container, user.id, supabase, email, baseDues, paidSoFar);
            if (totalDueEl) totalDueEl.textContent = '$' + Math.max(baseDues - paidSoFar, 0).toFixed(2);
            loadFundraisingCredit(supabase, user.id, baseDues, paidSoFar);
            return;
        }

        // 2. Fetch Payments for the Plan
        const currentPlan = plans[0];
        const { data: payments, error: paymentsError } = await supabase
            .from('payments')
            .select('*')
            .eq('plan_id', currentPlan.id)
            .order('installment_number', { ascending: true });

        if (paymentsError) throw paymentsError;

        // Section header: "Payment Plan" before April 1, "Outstanding Invoices" on/after
        const aprilFirst = new Date('2026-04-01T00:00:00');
        const now = new Date();
        if (sectionHeaderEl) {
            sectionHeaderEl.textContent = now < aprilFirst ? 'Payment Plan' : 'Outstanding Invoices';
        }

        // Always render the payments timeline — parents can pay early at any time
        renderPaymentsTimeline(container, payments, currentPlan, supabase);

        // Update status card
        const pendingPayments = payments.filter(p => p.status !== 'confirmed');
        let displayTotal = 0;
        if (pendingPayments.length > 0) {
            const nextPayment = pendingPayments[0];
            const isOverdue = new Date(nextPayment.due_date + 'T00:00:00') < now;
            displayTotal = pendingPayments.reduce((s, p) => s + parseFloat(p.amount), 0);
            statusTextEl.textContent = isOverdue ? 'Payment Overdue' : 'Payment Due ' + (now < aprilFirst ? 'Apr 1' : 'Soon');
            statusTextEl.style.color = isOverdue ? '#ef4444' : '#f59e0b';
            statusCard.style.borderLeftColor = isOverdue ? '#ef4444' : '#f59e0b';
            if (totalDueEl) totalDueEl.textContent = '$' + Math.max(baseDues - paidSoFar, 0).toFixed(2);
        } else {
            statusTextEl.textContent = 'Paid in Full';
            statusTextEl.style.color = '#10b981';
            statusCard.style.borderLeftColor = '#10b981';
            if (totalDueEl) totalDueEl.textContent = '$0.00';
        }

        // Load fundraising credit — pass real base dues and payments so the
        // breakdown and header reflect the actual remaining balance.
        loadFundraisingCredit(supabase, user.id, baseDues, paidSoFar);

    } catch (e) {
        console.error("Billing Error:", e);
        container.innerHTML = `<div style="text-align: center; padding: 20px; color: #ef4444; background: #fee2e2; border-radius: 12px;">Failed to load billing: ${e.message}</div>`;
    }
}

function handleDemoBilling(container, totalDueEl, statusTextEl, statusCard) {
    container.innerHTML = `
        <div style="text-align: center; padding: 20px; background: rgba(255,255,255,0.5); border-radius: 12px; color: #888; font-size: 0.9rem;">
            Demo Mode: Please sign in securely to view your open invoices and payment plans.
        </div>
    `;
    if (totalDueEl) totalDueEl.textContent = '$745';
    if (statusTextEl && statusCard) {
        statusTextEl.textContent = 'Action Required';
        statusTextEl.style.color = '#ef4444';
        statusCard.style.borderLeftColor = '#ef4444';
    }
}

// ─── FUNDRAISING CREDIT (parent billing view) ──────────────
async function loadFundraisingCredit(supabase, userId, totalDue, totalPaid) {
  const card = document.getElementById('billing-fundraising-card');
  if (!card) return;
  try {
    // 1. Get athlete name(s) linked to this parent
    const { data: links } = await supabase
      .from('parent_player_links')
      .select('athlete_id, athletes(display_name, first_name)')
      .eq('profile_id', userId);
    if (!links || !links.length) return;

    const athleteFirstName = (links[0].athletes?.first_name || links[0].athletes?.display_name || '').split(' ')[0];
    const athleteDisplay = links[0].athletes?.display_name || athleteFirstName;
    if (!athleteFirstName) return;

    // 2. Find matching fundraising record
    const { data: frRows } = await supabase
      .from('fundraising_totals')
      .select('total_raised, athlete_name')
      .ilike('athlete_name', athleteFirstName + '%')
      .limit(1);
    if (!frRows || !frRows.length || !frRows[0].total_raised) return;

    const raised = parseFloat(frRows[0].total_raised);
    if (raised <= 0) return;

    const originalDues = totalDue || 745;
    const paid = totalPaid || 0;
    // afterFundraising: for the fundraising card breakdown (excludes payments)
    const afterFundraising = Math.max(originalDues - raised, 0);
    // finalRemaining: for the header total (fundraising + payments combined)
    const finalRemaining = Math.max(afterFundraising - paid, 0);
    const progressPct = Math.min((raised / originalDues) * 100, 100);

    // 3. Populate static values
    document.getElementById('fc-athlete-name').textContent = athleteDisplay;
    document.getElementById('fc-original').textContent = '$' + originalDues.toFixed(2);
    document.getElementById('fc-raised').textContent = '-$' + raised.toFixed(2);
    document.getElementById('fc-original-strike').textContent = '$' + originalDues.toFixed(2);
    document.getElementById('fc-progress-label').textContent = Math.round(progressPct) + '% offset by fundraising';
    document.getElementById('fc-remaining-label').textContent = afterFundraising > 0 ? '$' + afterFundraising.toFixed(2) + ' after fundraising' : 'Fully covered by fundraising!';

    // 4. Show card
    card.style.display = 'block';

    // 5. Micro-animation sequence with confetti
    const newBalanceEl = document.getElementById('fc-new-balance');
    newBalanceEl.textContent = '$' + originalDues.toFixed(2);
    const badge = document.getElementById('fc-badge');

    requestAnimationFrame(() => {
      // Badge pop-in
      setTimeout(() => {
        if (badge) { badge.style.opacity = '1'; badge.style.transform = 'scale(1)'; }
      }, 200);

      // Reveal credit row
      setTimeout(() => {
        const creditRow = document.getElementById('fc-credit-row');
        creditRow.style.opacity = '1';
        creditRow.style.transform = 'translateY(0)';
      }, 400);

      // Reveal balance row + countdown
      setTimeout(() => {
        const balanceRow = document.getElementById('fc-balance-row');
        balanceRow.style.opacity = '1';
        balanceRow.style.transform = 'translateY(0)';
        animateCountdown(newBalanceEl, originalDues, afterFundraising, 900);
      }, 800);

      // Progress bar + confetti burst
      setTimeout(() => {
        document.getElementById('fc-progress-bar').style.width = progressPct + '%';
        document.getElementById('fc-progress-label').style.opacity = '1';
        document.getElementById('fc-remaining-label').style.opacity = '1';
        // Fire confetti
        launchFundraisingConfetti();
      }, 1200);

      // Update main status card — animate from payment-adjusted amount to final
      setTimeout(() => {
        const totalDueEl = document.getElementById('billing-total-due');
        var headerFrom = Math.max(originalDues - paid, 0);
        if (totalDueEl) animateCountdown(totalDueEl, headerFrom, finalRemaining, 600);
        const statusCard = document.getElementById('billing-status-card');
        const statusText = document.getElementById('billing-status-text');
        if (finalRemaining <= 0 && statusCard && statusText) {
          statusText.textContent = paid > 0 ? 'Paid in Full' : 'Covered by Fundraising';
          statusText.style.color = '#10b981';
          statusCard.style.borderLeftColor = '#10b981';
        }

        // Also update static Venmo modal if it exists
        const modalBalance = document.getElementById('tuition-modal-balance');
        if (modalBalance) modalBalance.textContent = '$' + finalRemaining.toFixed(2);

        const quickFull = document.getElementById('tuition-quick-full');
        if (quickFull) {
          quickFull.textContent = '$' + Math.ceil(finalRemaining) + ' Full';
          quickFull.onclick = function() { document.getElementById('tuition-pay-amount').value = finalRemaining.toFixed(2); };
        }
        const quickHalf = document.getElementById('tuition-quick-half');
        if (quickHalf) {
          const half = Math.ceil(finalRemaining / 2);
          quickHalf.textContent = '$' + half + ' Half';
          quickHalf.onclick = function() { document.getElementById('tuition-pay-amount').value = half; };
        }
        const quickCustom = document.getElementById('tuition-quick-custom');
        if (quickCustom) {
          const custom = Math.min(250, Math.ceil(finalRemaining));
          quickCustom.textContent = '$' + custom;
          quickCustom.onclick = function() { document.getElementById('tuition-pay-amount').value = custom; };
        }
      }, 2200);
    });
  } catch (e) { console.error('Fundraising credit load:', e); }
}

function animateCountdown(el, from, to, duration) {
  const start = performance.now();
  const format = (v) => '$' + v.toFixed(2);
  el.textContent = format(from);
  function tick(now) {
    const elapsed = now - start;
    const t = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - t, 3);
    const current = from + (to - from) * eased;
    el.textContent = format(current);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── CONFETTI for fundraising celebration ────────────────────
function launchFundraisingConfetti() {
  const canvas = document.getElementById('fc-confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.offsetWidth * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  ctx.scale(ratio, ratio);
  const W = canvas.offsetWidth, H = canvas.offsetHeight;

  const COLORS = ['#10b981','#059669','#34d399','#6ee7b7','#2563eb','#3b82f6','#fbbf24','#f59e0b','#f472b6','#a78bfa'];
  const COUNT = 80;
  const particles = [];

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: W * 0.5 + (Math.random() - 0.5) * W * 0.4,
      y: H * 0.5,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 10 - 4,
      w: Math.random() * 6 + 3,
      h: Math.random() * 4 + 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 15,
      gravity: 0.18 + Math.random() * 0.08,
      opacity: 1,
      decay: 0.008 + Math.random() * 0.006,
    });
  }

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    let alive = false;
    particles.forEach(p => {
      if (p.opacity <= 0) return;
      alive = true;
      p.x += p.vx;
      p.vy += p.gravity;
      p.y += p.vy;
      p.vx *= 0.99;
      p.rotation += p.rotSpeed;
      p.opacity -= p.decay;
      if (p.opacity <= 0) return;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    if (alive && frame < 180) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, W, H);
  }
  requestAnimationFrame(draw);
}

// ─── TRAINING SCHEDULE (parent billing view) ───────────────
async function loadBillingTrainingSchedule() {
  const rowsEl = document.getElementById('billing-training-rows');
  const totalEl = document.getElementById('billing-training-total');
  if (!rowsEl) return;
  try {
    let rows = [];
    if (window.auth && window.auth.isSupabaseAvailable()) {
      const sb = window.auth.getSupabaseClient();
      const { data, error } = await sb.rpc('get_training_schedule', { p_season: 'Spring/Summer 2026' });
      if (!error && data) rows = data;
    }
    if (!rows.length) { rowsEl.innerHTML = '<div style="text-align:center;padding:16px;color:#888;font-size:0.85rem">No schedule data available.</div>'; return; }
    const totalSessions = rows.reduce((a, r) => a + (+r.total_sessions || 0), 0);
    const totalCost = rows.reduce((a, r) => a + (+r.cost || 0), 0);
    if (totalEl) totalEl.innerHTML = `<div style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#999">${totalSessions} Sessions</div><div style="font-size:1.1rem;font-weight:800;color:#111">$${totalCost.toLocaleString()}</div>`;
    rowsEl.innerHTML = rows.map((r, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;${i < rows.length - 1 ? 'border-bottom:1px solid #f0f0f0;' : ''}">
        <div>
          <div style="font-weight:700;font-size:0.9rem;color:#111">${r.month_label}</div>
          <div style="font-size:0.75rem;color:#999;margin-top:2px">${r.season_segment} &middot; ${r.sessions_per_week}x/wk &middot; ${r.weeks} weeks</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800;font-size:0.95rem;color:#111">$${(+r.cost).toFixed(0)}</div>
          <div style="font-size:0.7rem;color:#999">${r.total_sessions} sessions</div>
        </div>
      </div>`).join('');
  } catch (e) { console.error('Training schedule load:', e); }
}

async function renderPlanSelectionUI(container, parentId, supabase, email, enrolledOwed, enrolledPaid) {
    // Resolve fundraising credit to calculate adjusted total
    const BASE_DUES = enrolledOwed || 745;
    let fundraisingCredit = 0;
    let athleteName = '';
    try {
        const { data: links } = await supabase
            .from('parent_player_links')
            .select('athlete_id, athletes(display_name, first_name)')
            .eq('profile_id', parentId);
        if (links && links.length) {
            const firstName = (links[0].athletes?.first_name || links[0].athletes?.display_name || '').split(' ')[0];
            athleteName = links[0].athletes?.display_name || firstName;
            if (firstName) {
                const { data: ft } = await supabase
                    .from('fundraising_totals')
                    .select('total_raised')
                    .ilike('athlete_name', firstName + '%')
                    .limit(1)
                    .single();
                if (ft) fundraisingCredit = parseFloat(ft.total_raised) || 0;
            }
        }
    } catch (e) { console.warn('Fundraising lookup in plan selection:', e); }

    const adjustedTotal = Math.max(BASE_DUES - fundraisingCredit, 0);
    const inst2 = Math.round(adjustedTotal / 2 * 100) / 100;
    const inst3First = Math.round(adjustedTotal / 3 * 100) / 100;
    const inst3Last = Math.round((adjustedTotal - inst3First * 2) * 100) / 100;
    const creditNote = fundraisingCredit > 0
        ? `<div style="background:#d1fae5;border:1px solid #a7f3d0;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:0.85rem;color:#065f46;font-weight:500;">Fundraising credit of $${fundraisingCredit.toFixed(2)} applied -- your adjusted total is $${adjustedTotal.toFixed(2)}</div>`
        : '';

    // Store adjusted total on window for selectPaymentPlan to use
    window._gsAdjustedDues = adjustedTotal;
    window._gsAthleteName = athleteName;

    container.innerHTML = `
        <div style="background: white; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h4 style="margin: 0 0 16px 0; font-size: 1.1rem; color: #111;">Select your Spring/Summer 2026 Payment Plan</h4>
            <p style="font-size: 0.9rem; color: #666; margin-bottom: 24px;">Godspeed Basketball offers multiple ways to handle your player's AAU tuition. Select the plan that works best for your family.</p>
            ${creditNote}

            <div style="display: grid; gap: 16px;">
                <!-- Full Pay -->
                <div class="plan-option" style="border: 2px solid #e5e7eb; border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s;" onclick="selectPaymentPlan(this, 'full', '${parentId}', '${email}')">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 800; font-size: 1.05rem; color: #111;">Pay in Full</div>
                            <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">One-time payment of $${adjustedTotal.toFixed(2)}</div>
                        </div>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #0071e3;">$${adjustedTotal.toFixed(0)}</div>
                    </div>
                </div>

                <!-- 2-Installment -->
                <div class="plan-option" style="border: 2px solid #e5e7eb; border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s;" onclick="selectPaymentPlan(this, '2-installment', '${parentId}', '${email}')">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 800; font-size: 1.05rem; color: #111;">2 Installments</div>
                            <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">Two payments of $${inst2.toFixed(2)} (April 15th, May 15th)</div>
                        </div>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #0071e3;">$${inst2.toFixed(0)}</div>
                    </div>
                </div>

                <!-- 3-Installment -->
                <div class="plan-option" style="border: 2px solid #e5e7eb; border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.2s;" onclick="selectPaymentPlan(this, '3-installment', '${parentId}', '${email}')">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 800; font-size: 1.05rem; color: #111;">3 Installments</div>
                            <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">$${inst3First.toFixed(2)} (Apr 15th), $${inst3First.toFixed(2)} (May 15th), $${inst3Last.toFixed(2)} (Jun 15th)</div>
                        </div>
                        <div style="font-size: 1.25rem; font-weight: 800; color: #0071e3;">$${inst3First.toFixed(0)}</div>
                    </div>
                </div>
            </div>

            <div style="margin-top: 24px;">
                <div style="display: flex; justify-content: flex-end;">
                    <button id="confirm-plan-btn" class="btn-primary" disabled style="opacity: 0.5; padding: 12px 28px; display: flex; align-items: center; gap: 8px; font-weight: 700; transition: opacity 0.2s;">
                        Enroll &amp; Continue
                    </button>
                </div>
                <div id="enroll-step-tracker" style="display: none; margin-top: 16px; padding: 14px 16px; background: #f9fafb; border-radius: 10px; border: 1px solid #e5e7eb;">
                    <div id="enroll-step-1" style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <span class="step-icon" style="width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"></span>
                        <span style="font-size: 0.85rem; color: #6b7280; font-weight: 500;">Creating payment plan</span>
                    </div>
                    <div id="enroll-step-2" style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; opacity: 0.35;">
                        <span class="step-icon" style="width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"></span>
                        <span style="font-size: 0.85rem; color: #6b7280; font-weight: 500;">Saving installments</span>
                    </div>
                    <div id="enroll-step-3" style="display: flex; align-items: center; gap: 10px; opacity: 0.35;">
                        <span class="step-icon" style="width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"></span>
                        <span style="font-size: 0.85rem; color: #6b7280; font-weight: 500;">Confirming enrollment</span>
                    </div>
                </div>
                <div id="enroll-error-msg" style="display: none; margin-top: 12px; padding: 10px 14px; background: #fef2f2; border-radius: 8px; border: 1px solid #fecaca; color: #dc2626; font-size: 0.85rem; font-weight: 500;"></div>
            </div>
        </div>
    `;

    // Inject spinner keyframes once
    if (!document.getElementById('gs-spinner-style')) {
        const s = document.createElement('style');
        s.id = 'gs-spinner-style';
        s.textContent = `
            @keyframes gs-spin { to { transform: rotate(360deg); } }
            .gs-spinner { animation: gs-spin 0.7s linear infinite; }
        `;
        document.head.appendChild(s);
    }

    const SPINNER_SVG = `<svg class="gs-spinner" width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#d1d5db" stroke-width="2"/><path d="M8 2a6 6 0 0 1 6 6" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/></svg>`;
    const CHECK_SVG  = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#d1fae5"/><path d="M5 8l2.5 2.5L11 5.5" stroke="#059669" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const DOT_SVG    = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" fill="#d1d5db"/></svg>`;

    function setStep(n, state) {
        // state: 'idle' | 'active' | 'done'
        const el = document.getElementById(`enroll-step-${n}`);
        if (!el) return;
        el.querySelector('.step-icon').innerHTML =
            state === 'active' ? SPINNER_SVG :
            state === 'done'   ? CHECK_SVG   : DOT_SVG;
        el.style.opacity = state === 'idle' ? '0.35' : '1';
        el.querySelector('span:last-child').style.color =
            state === 'done' ? '#059669' : state === 'active' ? '#111' : '#6b7280';
    }

    // Add interactivity script
    window.selectPaymentPlan = function(element, planType, parentId, email) {
        document.querySelectorAll('.plan-option').forEach(el => {
            el.style.borderColor = '#e5e7eb';
            el.style.background = 'white';
        });
        element.style.borderColor = '#0071e3';
        element.style.background = '#f0f9ff';

        const btn = document.getElementById('confirm-plan-btn');
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.onclick = async () => {
            // — Button mutation —
            btn.innerHTML = `${SPINNER_SVG} <span>Enrolling…</span>`;
            btn.disabled = true;
            btn.style.opacity = '0.85';

            // — Show step tracker —
            const tracker = document.getElementById('enroll-step-tracker');
            const errMsg  = document.getElementById('enroll-error-msg');
            tracker.style.display = 'block';
            errMsg.style.display  = 'none';
            setStep(1, 'active');
            setStep(2, 'idle');
            setStep(3, 'idle');

            try {
                // Use fundraising-adjusted total from renderPlanSelectionUI
                const adjustedTotal = window._gsAdjustedDues || 745;
                const athleteName = window._gsAthleteName || 'Your Athlete';

                // Calculate installments from adjusted total
                let installmentsArray = [];
                if (planType === 'full') {
                    installmentsArray = [{ number: 1, amount: adjustedTotal, dueDate: '2026-04-15' }];
                } else if (planType === '2-installment') {
                    const half = Math.round(adjustedTotal / 2 * 100) / 100;
                    installmentsArray = [
                        { number: 1, amount: half, dueDate: '2026-04-15' },
                        { number: 2, amount: Math.round((adjustedTotal - half) * 100) / 100, dueDate: '2026-05-15' }
                    ];
                } else if (planType === '3-installment') {
                    const third = Math.round(adjustedTotal / 3 * 100) / 100;
                    installmentsArray = [
                        { number: 1, amount: third, dueDate: '2026-04-15' },
                        { number: 2, amount: third, dueDate: '2026-05-15' },
                        { number: 3, amount: Math.round((adjustedTotal - third * 2) * 100) / 100, dueDate: '2026-06-15' }
                    ];
                }

                const totalAmount = installmentsArray.reduce((sum, i) => sum + i.amount, 0);

                // Step 1 — create plan record
                const { data: insertedPlan, error: planError } = await supabase
                    .from('payment_plans')
                    .insert({ parent_id: parentId, player_name: athleteName, plan_type: planType, total_amount: totalAmount })
                    .select()
                    .single();
                if (planError) throw planError;
                setStep(1, 'done');

                // Step 2 — write installments
                setStep(2, 'active');
                const dbInstallments = installmentsArray.map(i => ({
                    plan_id: insertedPlan.id,
                    parent_id: parentId,
                    installment_number: i.number,
                    amount: i.amount,
                    due_date: i.dueDate,
                    status: 'pending'
                }));
                const { error: paymentsError } = await supabase.from('payments').insert(dbInstallments);
                if (paymentsError) throw paymentsError;
                setStep(2, 'done');

                // Step 3 — confirm
                setStep(3, 'active');
                btn.innerHTML = CHECK_SVG + ' <span>Enrolled</span>';
                await new Promise(r => setTimeout(r, 600));
                setStep(3, 'done');

                await new Promise(r => setTimeout(r, 400));
                renderBilling(email);

            } catch (error) {
                console.error('Plan creation error:', error);
                // Reset button
                btn.innerHTML = 'Enroll &amp; Continue';
                btn.disabled = false;
                btn.style.opacity = '1';
                tracker.style.display = 'none';
                // Show inline error — no modal needed
                errMsg.textContent = 'Something went wrong setting up your plan. Please try again or contact support.';
                errMsg.style.display = 'block';
            }
        };
    };
}

function renderPaymentsTimeline(container, payments, plan, supabase) {
    const isFullPay = plan && plan.plan_type === 'full';

    // Inject spinner keyframe once
    if (!document.getElementById('gs-pay-spinner-style')) {
        const s = document.createElement('style');
        s.id = 'gs-pay-spinner-style';
        s.textContent = '@keyframes gsSpin{to{transform:rotate(360deg)}}';
        document.head.appendChild(s);
    }

    // Compute remaining balance for "Pay in Full" option
    const unpaidPayments = payments.filter(p => p.status !== 'confirmed');
    const remainingBalance = unpaidPayments.reduce((s, p) => s + parseFloat(p.amount), 0);
    const unpaidIds = unpaidPayments.map(p => p.id);

    let html = `<div style="display: flex; flex-direction: column; gap: 12px;">`;

    // Show "Pay Full Balance" button when there are 2+ unpaid installments
    if (!isFullPay && unpaidPayments.length > 1 && remainingBalance > 0) {
        html += `
            <div style="background:#f0f9ff;border-radius:10px;padding:14px 16px;border:2px solid #0071e3;display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-size:0.9rem;font-weight:700;color:#111;">Pay Full Balance</div>
                    <div style="font-size:0.8rem;color:#888;">Clear all remaining installments at once</div>
                </div>
                <div style="display:flex;align-items:center;gap:14px;">
                    <div style="font-size:1.1rem;font-weight:800;color:#111;">$${remainingBalance.toFixed(2)}</div>
                    <button class="btn-primary" style="padding:8px 18px;font-size:0.85rem;background:#0a0a0a;color:#fff;font-weight:700;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:6px;min-width:100px;justify-content:center;" data-amount="${remainingBalance}" data-label="Full Balance" data-payment-ids="${unpaidIds.join(',')}" onclick="window._directCheckout(this)">Pay Now</button>
                </div>
            </div>`;
    }

    payments.forEach(payment => {
        const isPaid    = payment.status === 'confirmed';
        const dueDate   = new Date(payment.due_date + 'T00:00:00');
        const isOverdue = !isPaid && dueDate < new Date();
        const rowLabel  = isFullPay ? 'Full Payment' : `Installment ${payment.installment_number}`;
        const btnId     = `gs-pay-btn-${payment.id}`;

        let statusBadge = '';
        let actionBtn   = '';
        let borderColor = '#e5e7eb';

        if (isPaid) {
            statusBadge = `<span style="background:#d1fae5;color:#059669;padding:3px 8px;border-radius:4px;font-size:0.7rem;font-weight:700;text-transform:uppercase;">Paid</span>`;
            borderColor = '#10b981';
        } else if (isOverdue) {
            statusBadge = `<span style="background:#fee2e2;color:#ef4444;padding:3px 8px;border-radius:4px;font-size:0.7rem;font-weight:700;text-transform:uppercase;">Overdue</span>`;
            borderColor = '#ef4444';
            actionBtn   = `<button id="${btnId}" class="btn-primary" style="padding:8px 18px;font-size:0.85rem;background:#0a0a0a;color:#fff;font-weight:700;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:6px;min-width:100px;justify-content:center;" data-payment-id="${payment.id}" data-amount="${payment.amount}" data-installment="${payment.installment_number}" data-label="${rowLabel}" onclick="window._directCheckout(this)">Pay Now</button>`;
        } else {
            statusBadge = `<span style="background:#fef3c7;color:#d97706;padding:3px 8px;border-radius:4px;font-size:0.7rem;font-weight:700;text-transform:uppercase;">Upcoming</span>`;
            borderColor = '#f59e0b';
            const btnBg = isFullPay ? '#0a0a0a' : '#6b7280';
            const btnLabel = isFullPay ? 'Pay Now' : 'Pay Early';
            actionBtn = `<button id="${btnId}" class="btn-primary" style="padding:8px 18px;font-size:0.85rem;background:${btnBg};color:#fff;font-weight:700;border:none;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:6px;min-width:100px;justify-content:center;" data-payment-id="${payment.id}" data-amount="${payment.amount}" data-installment="${payment.installment_number}" data-label="${rowLabel}" onclick="window._directCheckout(this)">${btnLabel}</button>`;
        }

        // Block later installments until prior ones are paid
        const previousUnpaid = payments.some(p => p.installment_number < payment.installment_number && p.status !== 'confirmed');
        if (previousUnpaid && !isPaid) {
            actionBtn = `<span style="font-size:0.75rem;color:#aaa;">Pay prior first</span>`;
        }

        html += `
            <div style="background:white;border-radius:10px;padding:14px 16px;border:1px solid ${borderColor};box-shadow:0 1px 3px rgba(0,0,0,0.03);display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:2px;">
                        <span style="margin:0;font-size:0.9rem;font-weight:700;color:#111;">${rowLabel}</span>
                        ${statusBadge}
                    </div>
                    <div style="font-size:0.8rem;color:#888;">${dueDate.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
                </div>
                <div style="display:flex;align-items:center;gap:14px;">
                    <div style="font-size:1.1rem;font-weight:800;color:#111;">$${payment.amount.toFixed(2)}</div>
                    ${actionBtn}
                </div>
            </div>`;
    });

    html += `</div>`;
    container.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Direct Checkout — opens Venmo payment modal (interim until Stripe live)
// ---------------------------------------------------------------------------
window._directCheckout = function(btn) {
    const amount      = parseFloat(btn.dataset.amount);
    const installment = parseInt(btn.dataset.installment, 10);
    const label       = btn.dataset.label || 'Payment';
    // Multi-payment (Pay Full Balance) passes comma-separated IDs
    const paymentIds  = btn.dataset.paymentIds || btn.dataset.paymentId;
    openPaymentModal({
        type: 'installment',
        label,
        amount,
        paymentId: paymentIds,
        installmentNumber: installment || 0
    });
}

// ---------------------------------------------------------------------------
// Payment Modal — Venmo QR + link (interim until Stripe live account ready)
// opts: { type: 'installment'|'trip', label, amount, paymentId?, installmentNumber?, tripId? }
// ---------------------------------------------------------------------------
window.openPaymentModal = function(opts) {
    const parentEmail = localStorage.getItem('gba_user_email') || '';
    const playerName  = localStorage.getItem('gba_selected_athlete_name') || 'Athlete';

    const existing = document.getElementById('gs-payment-modal-overlay');
    if (existing) existing.remove();

    const isInstallment = opts.type === 'installment';
    const amountFmt = (v) => '$' + parseFloat(v).toFixed(2);
    const venmoNote = encodeURIComponent('Godspeed ' + (opts.label || 'Payment') + ' - ' + playerName);
    const venmoDeepLink = 'https://venmo.com/Coachsco?txn=pay&amount=' + parseFloat(opts.amount).toFixed(2) + '&note=' + venmoNote;

    const overlay = document.createElement('div');
    overlay.id = 'gs-payment-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);animation:gsPmFadeIn 0.15s ease;';

    overlay.innerHTML = `
    <style>
        @keyframes gsPmFadeIn { from { opacity:0; transform:scale(0.97); } to { opacity:1; transform:scale(1); } }
        @keyframes gsSpin { to { transform:rotate(360deg); } }
        #gs-payment-modal { background:#fff; border-radius:16px; width:100%; max-width:440px; overflow:hidden;
            box-shadow:0 24px 64px rgba(0,0,0,0.22); font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif; }
        #gs-payment-modal .pm-header { background:#0a0a0a; color:#fff; padding:24px 28px 20px; }
        #gs-payment-modal .pm-header h2 { font-size:1.05rem; font-weight:800; letter-spacing:0.04em;
            text-transform:uppercase; margin:0 0 4px; }
        #gs-payment-modal .pm-header p { font-size:0.8rem; color:#9ca3af; margin:0; }
        #gs-payment-modal .pm-body { padding:24px 28px; }
        #gs-payment-modal .pm-row { display:flex; justify-content:space-between; align-items:center;
            padding:10px 0; border-bottom:1px solid #f3f4f6; font-size:0.9rem; }
        #gs-payment-modal .pm-row:last-child { border-bottom:none; }
        #gs-payment-modal .pm-label { color:#6b7280; font-weight:500; }
        #gs-payment-modal .pm-val { color:#111; font-weight:700; }
        #gs-payment-modal .pm-venmo-grid { display:flex; gap:16px; align-items:flex-start; margin:20px 0 16px; }
        #gs-payment-modal .pm-qr { flex-shrink:0; text-align:center; }
        #gs-payment-modal .pm-qr img { width:110px; height:110px; border-radius:8px; border:1px solid #e5e7eb; }
        #gs-payment-modal .pm-qr-caption { font-size:0.68rem; color:#9ca3af; margin-top:4px; }
        #gs-payment-modal .pm-venmo-right { flex:1; min-width:0; }
        #gs-payment-modal .pm-venmo-btn { display:block; background:#008CFF; color:#fff; text-align:center;
            font-weight:800; font-size:0.95rem; padding:14px; border-radius:10px; text-decoration:none;
            letter-spacing:0.02em; transition:background 0.15s; }
        #gs-payment-modal .pm-venmo-btn:hover { background:#0070CC; }
        #gs-payment-modal .pm-amount-wrap { margin-top:12px; }
        #gs-payment-modal .pm-amount-wrap label { display:block; font-size:0.7rem; font-weight:700;
            text-transform:uppercase; letter-spacing:0.06em; color:#6b7280; margin-bottom:4px; }
        #gs-payment-modal .pm-amount-input { display:flex; align-items:center; border:2px solid #e5e7eb;
            border-radius:10px; overflow:hidden; transition:border-color 0.15s; }
        #gs-payment-modal .pm-amount-input:focus-within { border-color:#0a0a0a; }
        #gs-payment-modal .pm-amount-input span { padding:0 10px; font-size:1rem; font-weight:700; color:#6b7280; }
        #gs-payment-modal .pm-amount-input input { flex:1; border:none; outline:none; font-size:1.15rem;
            font-weight:800; color:#0a0a0a; padding:10px 8px 10px 0; background:transparent; width:100%; }
        #gs-payment-modal .pm-actions { display:flex; gap:10px; margin-top:20px; }
        #gs-payment-modal .pm-btn-confirm { flex:1; background:#0a0a0a; color:#fff; border:none;
            padding:14px 20px; border-radius:10px; font-size:0.9rem; font-weight:800;
            text-transform:uppercase; letter-spacing:0.05em; cursor:pointer; transition:background 0.15s;
            display:flex; align-items:center; justify-content:center; gap:8px; }
        #gs-payment-modal .pm-btn-confirm:hover { background:#1f2937; }
        #gs-payment-modal .pm-btn-confirm:disabled { background:#9ca3af; cursor:not-allowed; }
        #gs-payment-modal .pm-btn-cancel { background:#f3f4f6; color:#374151; border:none;
            padding:14px 16px; border-radius:10px; font-size:0.9rem; font-weight:600; cursor:pointer; }
        #gs-payment-modal .pm-footer { font-size:0.75rem; color:#9ca3af; text-align:center; margin-top:14px; }
    </style>
    <div id="gs-payment-modal">
        <div class="pm-header">
            <h2>Godspeed Basketball</h2>
            <p>Venmo Payment - ${escapeHTML(opts.label)}</p>
        </div>
        <div class="pm-body">
            <div class="pm-row">
                <span class="pm-label">Athlete</span>
                <span class="pm-val">${escapeHTML(playerName)}</span>
            </div>
            <div class="pm-row">
                <span class="pm-label">Paying As</span>
                <span class="pm-val" style="font-size:0.85rem;">${escapeHTML(parentEmail) || '-'}</span>
            </div>
            ${isInstallment ? `<div class="pm-row">
                <span class="pm-label">Balance Due</span>
                <span class="pm-val">${amountFmt(opts.amount)}</span>
            </div>` : ''}

            <p style="font-size:0.82rem;color:#374151;margin:16px 0 0;line-height:1.5;">Send your payment via Venmo, then tap <strong>I Sent It</strong> below.</p>

            <div class="pm-venmo-grid">
                <div class="pm-qr">
                    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAXIAAAFyAQAAAADAX2ykAAAC40lEQVR4nO2cQYrjMBBFX40Ms5QhB+ijKFebI80N7KPkAA32skHmz0JS7KahQzOJsaFqYeToLT4UJVWV5Jj4iY2/foSD8847/1J+tmpXgNE66qhfzK5zR5vv9tHj/BP5DggZAGO+ZEtaTMw9EEGQIQ0A82UHPc6/gq/BCcDcYdYHra8lxK876nH+WXz36W0xgbD094JgwSDsqsf5l/OL1cHcfZ08gX7nv/CSyh6MXQkqqZW9ZaQJIEoadtTj/TP5paTHQFCJ2jQFkW6/ZVeA0czM+r30OP88voO4tjg+TMyLCTIa3zIQM9sWyNH0O//AJEmktj6XUZpAmoI0xExdmqOk4Wj6nf/eNimUAGpuFYUBJuYOI753pL9dPp5+5x+YNLVaNymjIapGbYlf2qO8Hk2/899bid/i4LF/x9LNUC2NFlNpZ8V30z56nH8uX0ujkjBPoIEgiFKdXaPb4/eEfKtw2zJMUnNtTa3cv2fmW2sj1qyZ4unm2pY637fjo+l3/oGt/m3xmyGpWkEG8Pg9J1/qXw2xFcHFjWX/vS/XMeP17yn5DuYepZuh0YKs+HI2gMU09hNAkJVD4KPpd/6B1fglqCbRkqRp279q3S1fn8/Hb/qTzZdqnp6C2sZMS7eOpt/5ByYptyK4eFqqVe96KhhbvuX+PRlf47f4MlbXtuPgUFfqweujs/KsHoS1dRVrJNeauKXT7t+z8S1+772MNNXHWiTV/dfroxPytT+ZtNa/60Rdn+ur778n5NHGpnoMWIP402+eP5+SZ43Qbf3bWpNrpeT51Wn5cHfoYvUxm5Xfxh40sBhjv5ce55/Hl/N9Kx+pxNyJ+SIg5HYLul2HTtpDj/Ov5IMY3zKMbx+2Sa2Gcid6fz3O/y9/v6GxbUiuVe969Qqvf8/Lbw/5b10dwWKkaTG7xtbCPKh+57/j1+8XFtOfvn7EIN06GPsgDXOHXWf//vd8vOkxszH/fwbnnT8Q/w9A0FAAh8LckAAAAABJRU5ErkJggg==" alt="Venmo QR">
                    <div class="pm-qr-caption">Scan with Venmo</div>
                </div>
                <div class="pm-venmo-right">
                    <a href="${venmoDeepLink}" target="_blank" rel="noopener" class="pm-venmo-btn">Open Venmo</a>
                    <div style="font-size:0.75rem;color:#9ca3af;margin-top:6px;text-align:center;">@Coachsco</div>
                    <div class="pm-amount-wrap">
                        <label>Amount to send</label>
                        <div class="pm-amount-input">
                            <span>$</span>
                            <input type="number" id="pm-amount-field" min="1" step="0.01"
                                value="${parseFloat(opts.amount).toFixed(2)}" autocomplete="off" inputmode="decimal">
                        </div>
                    </div>
                </div>
            </div>

            <div class="pm-actions">
                <button class="pm-btn-cancel" onclick="document.getElementById('gs-payment-modal-overlay').remove()">Cancel</button>
                <button class="pm-btn-confirm" id="pm-submit-btn">
                    I Sent It
                </button>
            </div>
            <p class="pm-footer">Coach Scott will confirm your Venmo within 24 hours.</p>
        </div>
    </div>`;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    document.getElementById('pm-submit-btn').addEventListener('click', () => window._submitVenmoModal(opts));
    setTimeout(() => document.getElementById('pm-amount-field')?.focus(), 80);
};

// ---------------------------------------------------------------------------
// Submit Venmo confirmation — records pending_venmo payment in DB for admin review
// ---------------------------------------------------------------------------
window._submitVenmoModal = async function(opts) {
    const amountInput = document.getElementById('pm-amount-field');
    const btn = document.getElementById('pm-submit-btn');
    const enteredAmount = parseFloat(amountInput?.value);

    if (!enteredAmount || enteredAmount < 1) {
        amountInput?.closest('.pm-amount-input')?.style.setProperty('border-color', '#ef4444');
        return;
    }

    if (!window.auth || !window.auth.isSupabaseAvailable()) {
        alert('Auth not ready. Please refresh and try again.');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:gsSpin 0.7s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Recording...`;

    const supabase    = window.auth.getSupabaseClient();

    // Refresh auth session in case it expired while user paid on phone
    try { await supabase.auth.getSession(); } catch (_) {}

    const parentEmail = localStorage.getItem('gba_user_email') || '';
    const parentName  = localStorage.getItem('gba_user_name') || '';
    const playerName  = localStorage.getItem('gba_selected_athlete_name') || 'Athlete';

    if (!parentEmail) {
        btn.disabled = false;
        btn.innerHTML = 'I Sent It';
        alert('No parent email found. Please sign out and sign back in.');
        return;
    }

    try {
        const receiptId = 'venmo_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
        const { error } = await supabase.from('dues_payments').insert({
            parent_email: parentEmail,
            parent_name: parentName,
            player_name: playerName,
            amount: enteredAmount,
            note: 'Venmo - ' + (opts.label || 'Payment') + ' (pending confirmation)',
            receipt_id: receiptId,
            status: 'pending_venmo'
        });
        if (error) throw error;

        document.getElementById('gs-payment-modal-overlay')?.remove();

        if (typeof showToast === 'function') {
            showToast('Venmo payment recorded. Coach Scott will confirm within 24 hours.', 'success');
        }
        // Refresh billing view
        if (parentEmail && typeof window.renderBilling === 'function') {
            setTimeout(() => window.renderBilling(parentEmail), 600);
        }
    } catch (err) {
        console.error('Venmo confirmation error:', err);
        btn.disabled = false;
        btn.innerHTML = 'I Sent It';
        alert('Could not record payment: ' + (err.message || 'Please try again.'));
    }
};

// Legacy alias — keeps any old direct calls working
window.triggerStripeCheckout = function(paymentId, amount, installmentNumber) {
    openPaymentModal({ type: 'installment', label: 'Installment ' + installmentNumber, amount, paymentId, installmentNumber });
};

// Static tuition modal — Venmo confirmation from the HTML overlay
window.submitVenmoConfirmation = async function() {
    const amountInput = document.getElementById('tuition-pay-amount');
    const noteInput   = document.getElementById('tuition-pay-note');
    const btn         = document.getElementById('tuition-pay-submit-btn');
    const errDiv      = document.getElementById('tuition-pay-error');
    const enteredAmount = parseFloat(amountInput?.value);

    errDiv.style.display = 'none';
    if (!enteredAmount || enteredAmount < 1) {
        errDiv.textContent = 'Enter the amount you sent on Venmo.';
        errDiv.style.display = 'block';
        amountInput?.focus();
        return;
    }
    if (!window.auth || !window.auth.isSupabaseAvailable()) {
        errDiv.textContent = 'Not connected. Refresh and try again.';
        errDiv.style.display = 'block';
        return;
    }

    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = 'Recording...';

    const supabase    = window.auth.getSupabaseClient();
    const parentEmail = localStorage.getItem('gba_user_email') || '';
    const parentName  = localStorage.getItem('gba_user_name') || '';
    const playerName  = localStorage.getItem('gba_selected_athlete_name') || 'Athlete';

    try {
        const receiptId = 'venmo_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
        const { error } = await supabase.from('dues_payments').insert({
            parent_email: parentEmail,
            parent_name: parentName,
            player_name: playerName,
            amount: enteredAmount,
            note: ((noteInput?.value || '').trim() || 'Venmo payment') + ' (pending confirmation)',
            receipt_id: receiptId,
            status: 'pending_venmo'
        });
        if (error) throw error;

        closeTuitionPaymentModal();
        if (typeof showToast === 'function') {
            showToast('Venmo payment recorded. Coach Scott will confirm within 24 hours.', 'success');
        }
        if (parentEmail && typeof window.renderBilling === 'function') {
            setTimeout(() => window.renderBilling(parentEmail), 600);
        }
    } catch (err) {
        console.error('Venmo confirmation error:', err);
        errDiv.textContent = 'Could not record: ' + (err.message || 'Try again.');
        errDiv.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = origText;
    }
};

})();
