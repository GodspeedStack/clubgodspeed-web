# Domain Setup Checklist: clubgodspeed.com

## Quick Reference

**Goal:** Point `clubgodspeed.com` to Vercel so it shows the same content as `clubgodspeed-web.vercel.app`

**Source of Truth:** GitHub `main` branch → Vercel → Domain

---

## Action Items (Manual Steps Required)

### ✅ Step 1: Add Domain in Vercel Dashboard

- [ ] Go to [Vercel Dashboard](https://vercel.com/dashboard)
- [ ] Select `clubgodspeed-web` project
- [ ] Navigate to **Settings** → **Domains**
- [ ] Click **"Add"**
- [ ] Enter: `clubgodspeed.com`
- [ ] (Optional) Add: `www.clubgodspeed.com`
- [ ] Copy the DNS records Vercel provides

**Status:** ⏳ **PENDING** - Requires Vercel dashboard access

---

### ✅ Step 2: Update DNS Records at Domain Registrar

- [ ] Log in to your domain registrar (where you manage `clubgodspeed.com`)
- [ ] Go to DNS management section
- [ ] **Remove old records:**
  - [ ] Delete any `A` records pointing to Netlify IPs
  - [ ] Delete any `A` records pointing to Firebase IPs
  - [ ] Delete any `CNAME` records pointing to old hosting
- [ ] **Add Vercel records:**
  - [ ] Add `A` record for root domain (use Vercel-provided IP)
  - [ ] Add `CNAME` record for www subdomain (if configured)
- [ ] Save DNS changes

**Status:** ⏳ **PENDING** - Requires domain registrar access

---

### ✅ Step 3: Wait for DNS Propagation

- [ ] Check DNS propagation: https://www.whatsmydns.net/#A/clubgodspeed.com
- [ ] Wait 1-24 hours (usually 1-2 hours)
- [ ] Verify DNS shows Vercel IP addresses

**Status:** ⏳ **PENDING** - Waiting for DNS propagation

---

### ✅ Step 4: Verify Configuration

- [ ] Check Vercel dashboard → Domains → Status shows "Valid Configuration"
- [ ] Visit `https://clubgodspeed.com` - should load
- [ ] Compare content with `https://clubgodspeed-web.vercel.app` - should be identical
- [ ] Verify SSL certificate is active (may take up to 24h)
- [ ] Test all pages (home, training, AAU, etc.)

**Status:** ⏳ **PENDING** - Waiting for DNS propagation

---

## Current Status

- ✅ **GitHub**: All code pushed to `main` branch
- ✅ **Vercel**: Auto-deploys from GitHub (working)
- ✅ **Documentation**: Updated with domain setup instructions
- ⏳ **Domain Configuration**: Requires manual steps above

---

## Expected Result

Once complete:
- `clubgodspeed.com` → Shows Vercel deployment → Shows GitHub code
- `clubgodspeed-web.vercel.app` → Vercel preview (always in sync)
- Both URLs show identical content
- Auto-deploys on every GitHub push

---

## Need Help?

See detailed guide: [DOMAIN_SETUP_GUIDE.md](DOMAIN_SETUP_GUIDE.md)
