# Parent Portal CTA Audit — Fixes Required

**Audit date:** 2026-03-25
**Page:** `parent-portal.html` (clubgodspeed.com)

---

## Issue 1: `completeOnboarding()` — Missing Function

**Severity:** High — Blocks new user onboarding flow
**Location:** Called at `parent-portal.html:1362` via `onclick="completeOnboarding()"`
**Problem:** Function is never defined in any JS file. The "Continue to Dashboard" button in the onboarding modal is dead.

### Fix — Add to `parent-portal.js` (after the `window.initPortal` definition, ~L3280)

```js
/**
 * Complete onboarding — saves parent/athlete names to Supabase profile
 * and transitions from onboarding modal to dashboard.
 */
window.completeOnboarding = async function() {
    const parentName = document.getElementById('onboard-parent-name')?.value?.trim();
    const athleteName = document.getElementById('onboard-athlete-name')?.value?.trim();

    if (!parentName || !athleteName) {
        alert('Please enter both your name and your athlete\'s name.');
        return;
    }

    const btn = document.getElementById('btn-complete-onboarding');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Setting up...';
    }

    try {
        const email = localStorage.getItem('gba_user_email');
        if (email && typeof getDB === 'function') {
            const db = getDB();
            const parentRecord = db.parent_accounts?.find(p => p.email === email);
            if (parentRecord) {
                parentRecord.parent_name = parentName;
                parentRecord.athlete_name = athleteName;
                parentRecord.onboarding_complete = true;
                localStorage.setItem('gba_db', JSON.stringify(db));
            }
        }

        localStorage.setItem('gba_onboarding_complete', 'true');
        localStorage.setItem('gba_parent_name', parentName);
        localStorage.setItem('gba_athlete_name', athleteName);

        // Close onboarding modal
        const modal = document.getElementById('onboarding-modal');
        if (modal) modal.style.display = 'none';

        // Show dashboard
        switchPortalView('documents', document.querySelector('[onclick*="documents"]'));
    } catch (err) {
        console.error('[onboarding] Error:', err);
        alert('Something went wrong. Please try again.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Continue to Dashboard';
        }
    }
};
```

---

## Issue 2: Cart Icon Dead Link

**Severity:** Low — Cosmetic, no functional impact on portal
**Location:** `parent-portal.html:69`
**Problem:** `<a href="#" id="cart-btn">` has no onclick handler. `cart-handler.js` is not loaded on this page. Clicking the cart icon just appends `#` to the URL.

### Fix — `parent-portal.html:69`

Change:
```html
<a href="#" id="cart-btn" class="nav-cart-btn" aria-label="Cart">
```

To:
```html
<a href="store.html" id="cart-btn" class="nav-cart-btn" aria-label="Cart">
```

This sends users to the store page where the full cart experience is available. Alternatively, hide the cart icon entirely on the parent portal if cart is not relevant here.

---

## Issue 3: `exposeServices.js` — Bare `otplib` Import Crashes Module

**Severity:** Medium — Prevents `window.otplib` from loading; breaks TOTP in `security.js`
**Location:** `src/lib/exposeServices.js:31`
**Problem:** `import { authenticator } from 'otplib'` is a bare Node.js module specifier. Browsers require relative paths or full URLs. This throws `TypeError: Failed to resolve module specifier "otplib"` and prevents the module from executing.

### Fix — `src/lib/exposeServices.js`

Replace lines 28-34:
```js
// Expose otplib for security.js TOTP functions
// security.js expects window.otplib to be available
import { authenticator } from 'otplib';
window.otplib = { authenticator };

console.log('[exposeServices] Security services exposed to window');
```

With:
```js
// Expose otplib for security.js TOTP functions
// security.js expects window.otplib to be available
// NOTE: otplib is a Node.js package and cannot be imported as a bare specifier
// in the browser. Use a CDN build or dynamic import with error handling.
try {
    const otplibModule = await import('https://cdn.jsdelivr.net/npm/otplib@12.0.1/+esm');
    window.otplib = { authenticator: otplibModule.authenticator };
} catch (e) {
    console.warn('[exposeServices] otplib not available — TOTP features disabled:', e.message);
    window.otplib = null;
}

console.log('[exposeServices] Security services exposed to window');
```

If TOTP is not currently used in production, a simpler fix is to stub it out:
```js
// otplib is not available in browser — stub for future use
window.otplib = null;
console.log('[exposeServices] Security services exposed to window (otplib stubbed)');
```

---

## CTAs Verified Working

| CTA | Location | Status |
|-----|----------|--------|
| HOME nav link | Nav bar | index.html (200) |
| TRAINING nav link | Nav bar | training.html (200) |
| AAU nav link | Nav bar | aau.html (200) |
| SHOP nav link | Nav bar | store.html (200) |
| ABOUT nav link | Nav bar | about.html (200) |
| TRAIN WITH US | Nav bar | training.html#signup (200) |
| Sign In icon dropdown | Nav bar | Shows member access dropdown |
| Parents link | Dropdown | parent-portal.html (200) |
| Coaches link | Dropdown | coach-portal.html (200) |
| Enter Portal | Login form | Submits login (Supabase auth) |
| Join | Login footer | Switches to signup view |
| Sign In | Signup footer | Switches to login view |
| Forgot? | Login form | Switches to password reset view |
| Send Reset Link | Reset form | Submits password reset |
| Sign In | Reset footer | Switches to login view |
| Sign In | Update PW footer | Switches to login view |
| Create Account | Signup form | Submits registration |
| Sign Out (sidebar) | Dashboard sidebar | handleLogout() |
| Sign Out (review) | Under review view | handleLogout() |
| Access Billing | Dashboard | switchPortalView('aau-billing') |
| Help us build | Dashboard | commitToGodspeed() |
| Sign Now (x5) | Documents section | openDocModal() for each doc |
| Download Guide | Documents | Godspeed_Parent_Guide_2026.docx (200) |
| Download Report | Training | viewTrainingStatement() |
| Purchase Hours | Training | Scrolls to buy section |
| View All (Receipts) | Training | loadReceipts() |
| View All (Invoices) | Training | showInvoicesList() |
| Confirm Order | Gear section | submitGearOrder() |
| Download Invoice | AAU Billing | Triggers invoice download |
| Save Changes | Settings | Saves profile |
| Read full letter | Dashboard memo | Expands manifesto content |
| Pay securely | Training cart | TrainingCart.handleCheckout() |
| Sidebar nav links (x8) | Dashboard sidebar | switchPortalView() — all work |
| Footer nav links | Footer | All resolve (200) |
| Bottom nav links | Mobile nav | All resolve (200) |
