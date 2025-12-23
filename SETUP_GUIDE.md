# 🚀 Quick Setup Guide - Godspeed Comms Center

## ✅ Dependencies Installed

The following packages have been installed:

- `@supabase/supabase-js` - Database and authentication
- `resend` - Email delivery service

---

## 📋 Step-by-Step Setup

### Option A: Interactive Wizard (Recommended)

Run the setup wizard to configure your environment variables:

```bash
bash scripts/setup-wizard.sh
```

The wizard will ask for:

1. Supabase Project URL
2. Supabase Anon Key
3. Resend API Key

### Option B: Manual Setup

1. **Copy the environment template:**

   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` and fill in your values:**

   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   VITE_RESEND_API_KEY=re_your_api_key_here
   ```

---

## 🔑 Getting Your Credentials

### 1. Supabase Setup

#### Create Project (if you haven't already)

1. Go to <https://app.supabase.com>
2. Click "New Project"
3. Fill in:
   - **Name**: Godspeed Basketball
   - **Database Password**: (create a strong password)
   - **Region**: Choose closest to you
4. Click "Create new project" (takes ~2 minutes)

#### Get Your Credentials

1. Go to **Settings** → **API**
2. Copy:
   - **Project URL** → Use for `VITE_SUPABASE_URL`
   - **anon public** key → Use for `VITE_SUPABASE_ANON_KEY`

#### Run Database Migration

1. Go to **SQL Editor** in Supabase dashboard
2. Click "New Query"
3. Copy the entire contents of `supabase/migrations/001_comms_center_schema.sql`
4. Paste into the editor
5. Click "Run" or press Cmd+Enter
6. You should see: "Success. No rows returned"

### 2. Resend Setup

#### Create Account

1. Go to <https://resend.com>
2. Sign up with your email
3. Verify your email address

#### Add Your Domain

1. Go to **Domains** → **Add Domain**
2. Enter your domain (e.g., `godspeedbasketball.com`)
3. Add the DNS records shown to your domain registrar:
   - **TXT record** for verification
   - **MX records** for email delivery
   - **DKIM records** for authentication
4. Click "Verify DNS Records"
5. Wait for verification (usually 5-15 minutes)

#### Get API Key

1. Go to **API Keys**
2. Click "Create API Key"
3. Name it: "Godspeed Comms Center"
4. Copy the key (starts with `re_`)
5. Use for `VITE_RESEND_API_KEY`

---

## ✅ Verification Checklist

Before deploying, verify:

- [ ] `.env` file exists with all 3 variables
- [ ] Supabase project created
- [ ] Database migration executed successfully
- [ ] Resend account created
- [ ] Domain verified in Resend
- [ ] API key generated

---

## 🧪 Test Your Setup

### Test Supabase Connection

```bash
# Start dev server
npm run dev

# Open browser console and run:
```

```javascript
import { supabase } from './src/lib/supabaseClient.js';

// Test connection
const { data, error } = await supabase.from('messages').select('count');
console.log('Supabase connected:', !error);
```

### Test Resend Email

```javascript
import { sendEmail } from './src/lib/resendClient.js';

// Test email
await sendEmail({
    from: 'test@yourdomain.com',
    to: 'your-email@example.com',
    subject: 'Test from Godspeed',
    html: '<p>If you see this, Resend is working!</p>'
});
```

---

## 🚀 Ready to Deploy

Once setup is complete, you can deploy with:

```bash
npx firebase-tools deploy --only hosting
```

---

## 📞 Troubleshooting

### "Supabase connection failed"

- Check that `VITE_SUPABASE_URL` is correct
- Verify `VITE_SUPABASE_ANON_KEY` is the **anon public** key, not the service key
- Make sure database migration was executed

### "Resend email failed"

- Verify domain is verified in Resend dashboard
- Check that API key is valid
- Ensure `from` email uses your verified domain

### "Environment variables not found"

- Make sure `.env` file is in the project root
- Restart your dev server after creating `.env`
- Check that variables start with `VITE_` prefix

---

## 📚 Documentation

- **Full Documentation**: `docs/COMMS_CENTER_README.md`
- **Environment Variables**: `docs/ENVIRONMENT_VARIABLES.md`
- **Architecture**: `docs/ARCHITECTURE_DIAGRAM.txt`

---

**Need Help?** Check the troubleshooting section in `docs/COMMS_CENTER_README.md`
