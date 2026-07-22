/**
 * fundraise.js -- Godspeed Raise client module
 * Shared by fundraise.html (campaign hub) and fundraise-player.html (player pages).
 *
 * Contract:
 *   - All public reads go through the get_campaign_public(slug) RPC (sanitized JSON).
 *   - Donations go through the fundraiser-checkout edge function -> Stripe Checkout.
 *   - A 503 from checkout means Stripe is not live yet; show the pre-launch state.
 *   - No PII is ever rendered beyond donor display names the donor chose to share.
 */
(function () {
    'use strict';

    const SUPABASE_URL = 'https://nnqokhqennuxalamnvps.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ucW9raHFlbm51eGFsYW1udnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzcwMDYsImV4cCI6MjA4MjAxMzAwNn0.hH9XR_tgi4Xl8nS__iHwiSkwjHUvwF88491q4O27cis';
    const DEFAULT_CAMPAIGN = '10u-season-2026';

    const params = new URLSearchParams(window.location.search);
    const campaignSlug = (params.get('c') || DEFAULT_CAMPAIGN).replace(/[^a-z0-9-]/gi, '');
    const playerSlug = (params.get('p') || '').replace(/[^a-z0-9-]/gi, '');

    const usd = (n) => '$' + Number(n || 0).toLocaleString('en-US');
    const pct = (raised, goal) => Math.min(Math.round((Number(raised) / Number(goal || 1)) * 100), 100);

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }

    async function fetchCampaign() {
        const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_campaign_public', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ p_slug: campaignSlug, p_preview: params.get('preview') === '1' })
        });
        if (!res.ok) throw new Error('Campaign fetch failed: ' + res.status);
        return res.json();
    }

    function daysLeft(endsAt) {
        return Math.max(Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000), 0);
    }

    // Display pair for the "Days left" stat so a live-but-final or ended
    // campaign never shows a misleading "0 / Days left".
    function daysLeftDisplay(endsAt, status) {
        if (status === 'ended' || status === 'paid_out') return { num: 'Ended', label: 'Campaign' };
        var d = daysLeft(endsAt);
        if (d === 0) return { num: 'Today', label: 'Closes' };
        return { num: d, label: 'Days left' };
    }

    function timeAgo(iso) {
        if (!iso) return '';
        const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
        if (m < 60) return m <= 1 ? 'just now' : m + ' minutes ago';
        const h = Math.floor(m / 60);
        if (h < 24) return h === 1 ? '1 hour ago' : h + ' hours ago';
        const d = Math.floor(h / 24);
        return d === 1 ? '1 day ago' : d + ' days ago';
    }

    // ---------------- Share links ----------------
    function shareLinks(url, athleteName) {
        const text = athleteName
            ? 'Support ' + athleteName + "'s Godspeed Basketball season. Every dollar goes to the kids:"
            : 'Support Godspeed Basketball. Every dollar goes to the kids:';
        return {
            sms: 'sms:?&body=' + encodeURIComponent(text + ' ' + url),
            email: 'mailto:?subject=' + encodeURIComponent('Support Godspeed Basketball')
                + '&body=' + encodeURIComponent(text + '\n\n' + url),
            x: 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url),
            facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url)
        };
    }

    async function copyLink(url, btn) {
        try {
            await navigator.clipboard.writeText(url);
            const prev = btn.textContent;
            btn.textContent = 'Copied';
            setTimeout(() => { btn.textContent = prev; }, 1600);
        } catch (e) { /* clipboard unavailable; no-op */ }
    }

    // ---------------- Donate flow ----------------
    async function startDonation(form, submitBtn) {
        const amountEl = form.querySelector('[data-amount-input]');
        const amount = parseFloat(amountEl.value);
        const donorName = form.querySelector('[name=donorName]').value.trim();
        const donorEmail = form.querySelector('[name=donorEmail]').value.trim();
        const message = (form.querySelector('[name=message]') || { value: '' }).value.trim();
        const isAnonymous = form.querySelector('[name=isAnonymous]').checked;
        const errEl = form.querySelector('[data-form-error]');
        errEl.textContent = ''; if (window.GodspeedRaise.isPreview) { errEl.textContent = 'Preview mode. Donations open when the campaign launches.'; return; }

        if (!donorName) { errEl.textContent = 'Please enter your name.'; return; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(donorEmail)) { errEl.textContent = 'Please enter a valid email.'; return; }
        if (!Number.isFinite(amount) || amount < 5) { errEl.textContent = 'Minimum donation is $5.'; return; }
        if (amount > 25000) { errEl.textContent = 'For gifts over $25,000, please contact us directly.'; return; }

        submitBtn.disabled = true;
        const prevLabel = submitBtn.textContent;
        submitBtn.textContent = 'Redirecting to secure checkout...';

        try {
            const res = await fetch(SUPABASE_URL + '/functions/v1/fundraiser-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
                body: JSON.stringify({
                    campaignSlug: campaignSlug,
                    participantSlug: playerSlug || null,
                    donorName: donorName,
                    donorEmail: donorEmail,
                    displayName: isAnonymous ? null : donorName,
                    isAnonymous: isAnonymous,
                    message: message || null,
                    amount: amount
                })
            });
            if (res.status === 503) {
                errEl.textContent = 'Online donations open very soon. Check back shortly.';
                return;
            }
            const data = await res.json();
            if (!res.ok || !data.url) {
                errEl.textContent = data.error || 'Something went wrong. Please try again.';
                return;
            }
            window.location.href = data.url;
        } catch (e) {
            errEl.textContent = 'Connection problem. Please try again.';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = prevLabel;
        }
    }

    function wireAmountButtons(scope) {
        const input = scope.querySelector('[data-amount-input]');
        scope.querySelectorAll('[data-amount]').forEach((btn) => {
            btn.addEventListener('click', () => {
                scope.querySelectorAll('[data-amount]').forEach((b) => b.classList.remove('amount-active'));
                btn.classList.add('amount-active');
                input.value = btn.getAttribute('data-amount');
            });
        });
        input.addEventListener('input', () => {
            scope.querySelectorAll('[data-amount]').forEach((b) => b.classList.remove('amount-active'));
        });
    }

    function wireDonateForm(scope) {
        const form = scope.querySelector('[data-donate-form]');
        if (!form) return;
        wireAmountButtons(form);
        const btn = form.querySelector('[data-donate-submit]');
        form.addEventListener('submit', (e) => { e.preventDefault(); startDonation(form, btn); });
    }

    function thanksBanner() {
        if (params.get('thanks') !== '1') return;
        const el = document.querySelector('[data-thanks-banner]');
        if (el) el.style.display = 'block';
    }

    window.GodspeedRaise = {
        campaignSlug: campaignSlug,
        playerSlug: playerSlug,
        fetchCampaign: fetchCampaign,
        usd: usd,
        pct: pct,
        esc: esc,
        daysLeft: daysLeft,
        daysLeftDisplay: daysLeftDisplay,
        timeAgo: timeAgo,
        shareLinks: shareLinks,
        copyLink: copyLink,
        wireDonateForm: wireDonateForm,
        thanksBanner: thanksBanner, _preview: (function(){var P=new URLSearchParams(location.search);if(P.get('preview')!=='1')return false;function fix(){document.querySelectorAll('a[href*="fundraise"]').forEach(function(a){try{var u=new URL(a.getAttribute('href'),location.href);if(/fundraise/.test(u.pathname)&&!u.searchParams.get('preview')){u.searchParams.set('preview','1');a.setAttribute('href',u.pathname.split('/').pop()+u.search+u.hash);}}catch(e){}});}var bar=document.createElement('div');bar.textContent='Preview mode. This is what donors will see at launch. Donations are disabled.';bar.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#111;color:#fff;font:600 13px Inter,sans-serif;text-align:center;padding:12px 16px;border-top:1px solid #2563eb;';function init(){document.body.appendChild(bar);fix();new MutationObserver(fix).observe(document.body,{childList:true,subtree:true});}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}return true;})(), get isPreview(){return this._preview;}
    };
})();
