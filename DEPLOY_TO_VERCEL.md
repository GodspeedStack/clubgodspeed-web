# Deploy to Vercel - Step-by-Step Guide

## ✅ What We Just Did

1. **Removed Netlify files:**
   - Deleted `netlify.toml`
   - Deleted `.netlify-deploy-trigger`
   - Deleted `.cache-bust`

2. **Created Vercel configuration:**
   - Added `vercel.json` with client-side routing support
   - Updated `package.json` build script for static HTML

3. **Pushed to GitHub:**
   - Commit: `b441c9f` - "Migrate from Netlify to Vercel - clean house and add Vercel config"
   - All changes are live on GitHub

---

## 🚀 Deploy to Vercel (5 Minutes)

### Step 1: Sign Up / Log In to Vercel

1. Go to: **<https://vercel.com>**
2. Click **"Sign Up"** (or "Log In" if you have an account)
3. Choose **"Continue with GitHub"**
4. Authorize Vercel to access your GitHub account

---

### Step 2: Import Your Project

1. Once logged in, click **"Add New..."** → **"Project"**
2. You'll see a list of your GitHub repositories
3. Find **`Jewellsco/clubgodspeed-web`**
4. Click **"Import"**

---

### Step 3: Configure Project Settings

Vercel will auto-detect your settings. **Verify these:**

#### **Framework Preset:**

- Select: **"Other"** (since this is a static HTML site)

#### **Root Directory:**

- Leave as: **`./`** (root)

#### **Build Command:**

- Leave **EMPTY** or set to: `echo "Static site"`
  
#### **Output Directory:**

- Leave as: **`.`** (current directory)

#### **Install Command:**

- Leave as: `npm install` (or empty)

---

### Step 4: Add Environment Variables

Click **"Environment Variables"** and add these:

| Name | Value | Where to Find It |
|------|-------|------------------|
| `SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | Your Supabase anon key | Supabase Dashboard → Settings → API |
| `STRIPE_PUBLISHABLE_KEY` | Your Stripe publishable key | Stripe Dashboard → Developers → API Keys |
| `RESEND_API_KEY` | Your Resend API key | Resend Dashboard → API Keys |

**Important:** Make sure these match EXACTLY what's in your code (check your HTML files for the variable names).

---

### Step 5: Deploy

1. Click **"Deploy"**
2. Vercel will:
   - Clone your GitHub repo
   - Run the build (which does nothing for static HTML)
   - Deploy your site
   - Give you a URL like: `clubgodspeed-web.vercel.app`

**This takes ~30-60 seconds.**

---

### Step 6: Add Custom Domain

**Important:** `clubgodspeed.com` is the production domain. `www.godspeed.com` is NOT owned by this project (ignore it).

1. Once deployed, go to **"Settings"** → **"Domains"**
2. Click **"Add"**
3. Enter: **`clubgodspeed.com`**
4. (Optional) Also add: **`www.clubgodspeed.com`** if you want www subdomain
5. Vercel will provide DNS records to configure

#### **Update Your DNS (at your domain registrar):**

**Step 1: Remove Old Records**

- Delete any `A` records pointing to Netlify IPs
- Delete any `A` records pointing to Firebase IPs
- Delete any `CNAME` records pointing to old hosting

**Step 2: Add Vercel DNS Records**

Vercel will show you the exact records needed. Typically:

**For root domain (`clubgodspeed.com`):**
```
Type: A     | Host: @              | Value: [Vercel-provided IP]
```

**For www subdomain (`www.clubgodspeed.com`):**
```
Type: CNAME | Host: www            | Value: cname.vercel-dns.com
```

**Important Notes:**
- Use the exact values Vercel provides (they may differ from examples)
- DNS changes can take 1-24 hours to propagate (usually 1-2 hours)
- Vercel automatically provisions SSL certificates (may take up to 24h)

**Step 3: Verify DNS Configuration**

After updating DNS, verify with:
- Online DNS checker: https://www.whatsmydns.net/
- Command line: `dig clubgodspeed.com` or `nslookup clubgodspeed.com`
- Check Vercel dashboard for domain status (should show "Valid Configuration")

---

### Step 7: Enable Automatic Deployments

Vercel automatically deploys when you push to GitHub! 🎉

Every time you:

1. Make changes locally
2. Commit: `git commit -m "Your message"`
3. Push: `git push origin main`

Vercel will **automatically** rebuild and deploy in ~30 seconds.

---

## 🔍 Verify Deployment

### Verify Vercel Deployment

```bash
curl -s "https://clubgodspeed-web.vercel.app/about" | grep "coach-true-v2.png"
```

**Expected:** Should show the `<img>` tag with the photo.

### Verify Domain Points to Vercel

Once DNS is configured, verify both URLs show identical content:

1. **Vercel Preview**: <https://clubgodspeed-web.vercel.app>
2. **Production Domain**: <https://clubgodspeed.com>

Both should show the same content (source of truth: GitHub `main` branch).

**Deployment Flow:**
```
GitHub (main branch) → Vercel → Domain (clubgodspeed.com)
```

If the domain shows different content than Vercel:
- DNS may not be pointing to Vercel yet
- DNS may still be propagating (wait 1-24 hours)
- Check Vercel dashboard → Domains for configuration status

---

## 🆘 Troubleshooting

### Issue: Site shows blank page

**Solution:** Check environment variables in Vercel dashboard. Make sure they're set correctly.

### Issue: 404 on page refresh

**Solution:** Verify `vercel.json` exists with the rewrite rules (we already added this).

### Issue: Old version still showing

**Solution:**

1. Go to Vercel dashboard → Deployments
2. Click the latest deployment
3. Click "Redeploy"

---

## 📋 What's Different from Netlify?

| Feature | Netlify | Vercel |
|---------|---------|--------|
| **Deploy Speed** | 2-5 minutes | 30-60 seconds |
| **Cache Issues** | Frequent | Rare |
| **Auto-Deploy** | Yes | Yes |
| **Custom Domain** | Free SSL | Free SSL |
| **Build Logs** | Good | Excellent |

---

## ✅ Final Checklist

- [ ] Signed up for Vercel
- [ ] Imported `Jewellsco/clubgodspeed-web` from GitHub
- [ ] Set Framework to "Other"
- [ ] Added environment variables
- [ ] Deployed successfully
- [ ] Added custom domain `clubgodspeed.com` in Vercel dashboard
- [ ] Updated DNS records at domain registrar
- [ ] Verified DNS propagation (check with whatsmydns.net)
- [ ] Verified `clubgodspeed.com` shows same content as `clubgodspeed-web.vercel.app`
- [ ] Verified Coach True's photo is showing
- [ ] Confirmed SSL certificate is active (Vercel auto-provisions)

---

## 🎯 Next Steps After Deployment

1. **Test the live site:** <https://clubgodspeed.com/about>
2. **Hard refresh:** `Cmd + Shift + R` (Mac) or `Ctrl + Shift + R` (Windows)
3. **Verify all pages work:**
   - Home
   - Training
   - AAU
   - About (Coach photos)
   - Store

---

**Need help?** Check the Vercel deployment logs in the dashboard for any errors.

**Last Updated:** 2025-12-23 00:55 MST  
**Status:** ✅ Ready to deploy to Vercel
