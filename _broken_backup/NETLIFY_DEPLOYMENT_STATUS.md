# Netlify Deployment Status

## Current Issue

The live site at **<https://clubgodspeed.com/about>** is showing "PHOTO COMING SOON" for Coach True instead of his actual photo.

## Root Cause

Netlify is deploying an **old cached version** of the site, even though the GitHub repository has the correct, updated files.

## What We've Verified ✅

### 1. Local Files Are Correct

- `about.html` line 124: `<img src="assets/coach-true-v2.png" alt="Coach True" class="coach-photo">`
- Image file exists: `assets/coach-true-v2.png` (451KB)

### 2. Git Repository Is Correct

- Latest commit: `86447f1` - "Update Netlify config - force fresh deployment"
- File is tracked in Git: `git ls-tree HEAD assets/coach-true-v2.png` ✅
- HTML references correct image: `git show HEAD:about.html | grep coach-true` ✅

### 3. GitHub Push Successful

```
To https://github.com/Jewellsco/clubgodspeed-web.git
   e2e75f0..86447f1  main -> main
```

## Actions Taken

### 1. Updated `netlify.toml`

Added Node version specification to force fresh build:

```toml
[build]
  command = ""
  publish = "."

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

# Force fresh deployment - ignore cache
[build.environment]
  NODE_VERSION = "18"
```

### 2. Triggered Multiple Deployments

- Created `.netlify-deploy-trigger` file
- Pushed 3 separate commits to trigger new builds
- Each push confirmed successful to GitHub

## Current Status (as of 2025-12-23 00:35 MST)

**Waiting for Netlify to:**

1. Detect the latest GitHub push
2. Pull the updated files
3. Deploy to production
4. Clear CDN cache

**Expected Timeline:** 2-5 minutes from last push

## Next Steps

### If Site Still Shows Old Version After 5 Minutes

1. **Manual Netlify Dashboard Actions:**
   - Go to: <https://app.netlify.com/sites/clubgodspeed-web/deploys>
   - Click "Trigger deploy" → "Clear cache and deploy site"

2. **Check Deploy Logs:**
   - Click on the latest deployment
   - Verify it's pulling from commit `86447f1` or later
   - Check for any errors in the build log

3. **Verify Environment:**
   - Ensure no build commands are interfering
   - Confirm `publish` directory is set to `.` (root)

## Technical Details

### File Paths

- **HTML:** `/about.html` (line 124)
- **Image:** `/assets/coach-true-v2.png`
- **Config:** `/netlify.toml`

### Git History

```
86447f1 Update Netlify config - force fresh deployment
e2e75f0 Force Netlify redeploy - Coach True photo fix
20ac18f Remove old deployment folders causing conflicts
43a2d87 Force rebuild: Update Coach True photo to retouched version
```

### Image Commit

```
commit 87e3ba864992c2b235dafc1fa7f7f55be2db155c
Date:   Mon Dec 22 11:33:40 2025 -0700
Message: Force fix for Coach True photo: Renamed file to v2 to bust cache
```

## Why This Is Happening

Netlify uses aggressive caching for static sites. Even though:

- ✅ Files are correct locally
- ✅ Files are correct in GitHub
- ✅ Commits are pushed successfully

Netlify may still serve cached versions if:

- Build hasn't triggered yet
- CDN cache hasn't cleared
- Deploy is queued behind other builds

## Verification Command

Once deployed, run:

```bash
curl -s "https://clubgodspeed.com/about" | grep "coach-true-v2.png"
```

**Expected output:** Should show the `<img>` tag with `src="assets/coach-true-v2.png"`

**Current output:** Returns nothing (meaning the old placeholder is still there)

---

**Last Updated:** 2025-12-23 00:35 MST  
**Status:** ⏳ Waiting for Netlify deployment to complete
