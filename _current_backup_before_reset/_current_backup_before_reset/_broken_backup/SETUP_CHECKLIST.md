# ✅ Comms Center Setup Checklist

## 📦 Step 1: Dependencies (COMPLETED ✅)

- [x] Installed @supabase/supabase-js
- [x] Installed resend

---

## 🔐 Step 2: Get Your Credentials

### A. Supabase Credentials

**Browser tabs opened for you:**

- Supabase: <https://app.supabase.com>

**To Do:**

1. [ ] Log in to Supabase (or create account)
2. [ ] Create new project named "Godspeed Basketball"
3. [ ] Wait for project to be created (~2 minutes)
4. [ ] Go to Settings → API
5. [ ] Copy **Project URL** → Save this
6. [ ] Copy **anon public** key → Save this
7. [ ] Go to SQL Editor
8. [ ] Copy contents of `supabase/migrations/001_comms_center_schema.sql`
9. [ ] Paste and run the SQL
10. [ ] Verify: "Success. No rows returned"

### B. Resend Credentials

**Browser tabs opened for you:**

- Resend: <https://resend.com>

**To Do:**

1. [ ] Click "Get Started" or "Log In"
2. [ ] Create account or log in
3. [ ] Go to Domains → Add Domain
4. [ ] Enter your domain: `godspeedbasketball.com` (or your domain)
5. [ ] Add DNS records to your domain registrar
6. [ ] Wait for verification (~5-15 minutes)
7. [ ] Go to API Keys
8. [ ] Click "Create API Key"
9. [ ] Name it: "Godspeed Comms Center"
10. [ ] Copy the API key (starts with `re_`) → Save this

---

## ⚙️ Step 3: Configure Environment

**Option A: Use the Interactive Wizard**

```bash
bash scripts/setup-wizard.sh
```

**Option B: Manual Setup**

```bash
# Copy template
cp .env.example .env

# Edit .env and paste your credentials:
# VITE_SUPABASE_URL=https://your-project-id.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...
# VITE_RESEND_API_KEY=re_...
```

---

## 🧪 Step 4: Test Setup

```bash
# Start dev server
npm run dev

# Open http://localhost:5173 in browser
# Check console for any errors
```

---

## 🚀 Step 5: Deploy (After setup is complete)

```bash
npx firebase-tools deploy --only hosting
```

---

## 📝 Your Credentials (Fill in as you get them)

```
SUPABASE_URL: _________________________________

SUPABASE_ANON_KEY: _________________________________

RESEND_API_KEY: _________________________________
```

---

## ❓ Need Help?

- **Supabase Issues**: Check `docs/ENVIRONMENT_VARIABLES.md`
- **Resend Issues**: Check `SETUP_GUIDE.md`
- **General Help**: Check `docs/COMMS_CENTER_README.md`

---

**Once you have all 3 credentials, run the setup wizard or create the .env file manually!**
