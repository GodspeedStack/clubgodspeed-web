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

1. Once deployed, go to **"Settings"** → **"Domains"**
2. Click **"Add"**
3. Enter: **`clubgodspeed.com`**
4. Vercel will give you DNS records to update

#### **Update Your DNS (at your domain registrar):**

**Remove old Netlify records:**

- Delete any `A` records pointing to Netlify IPs

**Add Vercel records:**

- Vercel will show you exactly what to add (usually a `CNAME` or `A` record)

**Example:**

```
Type: A     | Host: @              | Value: 76.76.21.21
Type: CNAME | Host: www            | Value: cname.vercel-dns.com
```

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

### Check if Coach True's photo is live

```bash
curl -s "https://clubgodspeed-web.vercel.app/about" | grep "coach-true-v2.png"
```

**Expected:** Should show the `<img>` tag with the photo.

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
- [ ] Added custom domain `clubgodspeed.com`
- [ ] Updated DNS records
- [ ] Verified Coach True's photo is showing

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
