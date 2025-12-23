# 🚀 Deploy Godspeed to GitHub + Netlify

## **Step 1: Push to GitHub**

### 1.1 Initialize Git Repository

```bash
cd /Users/shortsread/.gemini/antigravity/scratch/aau_site
git init
```

### 1.2 Create .gitignore

```bash
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
package-lock.json

# Environment variables
.env
.env.local
.env.production

# Firebase
.firebase/
.firebaserc
firebase-debug.log

# System files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/

# Logs
*.log
npm-debug.log*

# Build outputs
dist/
build/
.cache/

# Netlify
.netlify/
EOF
```

### 1.3 Add All Files

```bash
git add .
```

### 1.4 Create Initial Commit

```bash
git commit -m "Initial commit: Godspeed Basketball website with store"
```

### 1.5 Add GitHub Remote

```bash
git remote add origin https://github.com/Jewellsco/clubgodspeed-web.git
```

### 1.6 Push to GitHub

```bash
git branch -M main
git push -u origin main
```

**Note**: You'll need to authenticate with GitHub. Use a Personal Access Token (PAT) instead of password.

---

## **Step 2: Set Up Netlify Auto-Deploy**

### 2.1 Create netlify.toml Configuration

```bash
cat > netlify.toml << 'EOF'
[build]
  # No build command needed - static HTML site
  publish = "."
  
[build.environment]
  # Environment variables (if needed)
  NODE_VERSION = "18"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*.css"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*.js"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
EOF
```

### 2.2 Commit Netlify Config

```bash
git add netlify.toml
git commit -m "Add Netlify configuration"
git push
```

---

## **Step 3: Connect Netlify to GitHub**

### Option A: Via Netlify Dashboard (Recommended)

1. **Go to Netlify**: <https://app.netlify.com>
2. **Click "Add new site"** → "Import an existing project"
3. **Connect to GitHub**:
   - Click "GitHub"
   - Authorize Netlify
4. **Select Repository**:
   - Choose `Jewellsco/clubgodspeed-web`
5. **Configure Build Settings**:
   - **Branch to deploy**: `main`
   - **Build command**: (leave empty)
   - **Publish directory**: `.` (current directory)
6. **Add Environment Variables** (if needed):
   - Click "Show advanced"
   - Add any env vars from your `.env` file:
     - `SUPABASE_URL`
     - `SUPABASE_ANON_KEY`
     - `RESEND_API_KEY`
     - `STRIPE_PUBLISHABLE_KEY`
7. **Click "Deploy site"**

### Option B: Via Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Initialize Netlify site
netlify init

# Follow prompts:
# - Create & configure a new site
# - Choose your team
# - Site name: clubgodspeed-web
# - Build command: (leave empty)
# - Directory to deploy: .
```

---

## **Step 4: Configure Custom Domain (Optional)**

### In Netlify Dashboard

1. Go to **Site settings** → **Domain management**
2. Click **Add custom domain**
3. Enter your domain (e.g., `clubgodspeed.com`)
4. Follow DNS configuration instructions

---

## **Step 5: Set Up Automatic Deployments**

✅ **Already Done!** Once connected, Netlify will automatically:

- Deploy on every push to `main` branch
- Create preview deployments for pull requests
- Show build logs and deploy status

---

## **Step 6: Add Deploy Badge to README (Optional)**

```bash
cat > README.md << 'EOF'
# Godspeed Basketball

[![Netlify Status](https://api.netlify.com/api/v1/badges/YOUR-SITE-ID/deploy-status)](https://app.netlify.com/sites/clubgodspeed-web/deploys)

Elite AAU basketball program website with integrated e-commerce store.

## 🚀 Live Site
- **Production**: https://clubgodspeed-web.netlify.app
- **Custom Domain**: (if configured)

## 🛠️ Tech Stack
- HTML, CSS, JavaScript
- Supabase (Database)
- Stripe (Payments)
- Netlify (Hosting)

## 📦 Deployment
Automatically deploys to Netlify on push to `main` branch.

EOF

git add README.md
git commit -m "Add README with deploy badge"
git push
```

---

## **Quick Reference Commands**

### Push Changes to GitHub

```bash
git add .
git commit -m "Your commit message"
git push
```

### Check Deployment Status

```bash
netlify status
```

### View Live Site

```bash
netlify open:site
```

### View Admin Dashboard

```bash
netlify open:admin
```

---

## **Environment Variables Setup**

### Add to Netlify

1. Go to **Site settings** → **Environment variables**
2. Add these variables:

```
SUPABASE_URL=https://nnqokhqennuxalamnvps.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
RESEND_API_KEY=re_MELpnVZ2_N9oYxN9uKCJhQboruPK3t59o
STRIPE_PUBLISHABLE_KEY=pk_test_51ShHrgE7EsBJ8KwAJn7HC8BV...
```

---

## **Troubleshooting**

### Build Fails

- Check build logs in Netlify dashboard
- Verify `netlify.toml` is correct
- Ensure all files are committed

### Environment Variables Not Working

- Make sure they're added in Netlify dashboard
- Redeploy after adding variables

### Custom Domain Issues

- Verify DNS settings
- Wait for DNS propagation (up to 48 hours)
- Check SSL certificate status

---

## **Next Steps**

1. ✅ Push code to GitHub
2. ✅ Connect Netlify to repository
3. ✅ Configure environment variables
4. ✅ Set up custom domain (optional)
5. ✅ Enable automatic deployments

**Your site will auto-deploy on every push to `main`!** 🚀
