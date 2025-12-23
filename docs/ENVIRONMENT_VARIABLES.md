# 🔑 Godspeed Comms Center - Required Environment Variables

## Overview

This document lists all environment variables needed to run the Godspeed Comms Center.

---

## 📋 Required Environment Variables

### 1. Supabase Configuration

#### `VITE_SUPABASE_URL`

- **Description**: Your Supabase project URL
- **Format**: `https://your-project-id.supabase.co`
- **Where to get it**:
  1. Go to <https://app.supabase.com>
  2. Select your project
  3. Go to Settings → API
  4. Copy "Project URL"

#### `VITE_SUPABASE_ANON_KEY`

- **Description**: Your Supabase anonymous/public API key
- **Format**: Long string starting with `eyJ...`
- **Where to get it**:
  1. Go to <https://app.supabase.com>
  2. Select your project
  3. Go to Settings → API
  4. Copy "anon public" key
- **Security**: Safe to expose in frontend (public key)

---

### 2. Resend Email Configuration

#### `VITE_RESEND_API_KEY`

- **Description**: Resend API key for sending emails
- **Format**: `re_xxxxxxxxxxxxxxxxxxxxxxxx`
- **Where to get it**:
  1. Go to <https://resend.com>
  2. Sign up or log in
  3. Go to API Keys section
  4. Click "Create API Key"
  5. Copy the generated key
- **Security**: Keep this secret! Do not commit to version control

---

## 📝 Setup Checklist

- [ ] Create Supabase account and project
- [ ] Get Supabase URL and anon key
- [ ] Create Resend account
- [ ] Verify your sending domain in Resend
- [ ] Get Resend API key
- [ ] Create `.env` file in project root
- [ ] Add all environment variables to `.env`
- [ ] Add `.env` to `.gitignore`
- [ ] Test connection to Supabase
- [ ] Test sending email via Resend

---

## 🔧 .env File Template

Create a `.env` file in your project root with these variables:

```env
# =====================================================
# GODSPEED COMMS CENTER - ENVIRONMENT VARIABLES
# =====================================================

# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Resend Email Configuration
VITE_RESEND_API_KEY=re_your_api_key_here
```

---

## 🚀 Production Deployment

### For Firebase Hosting

```bash
firebase functions:config:set \
  supabase.url="https://your-project-id.supabase.co" \
  supabase.anon_key="your-anon-key" \
  resend.api_key="re_your_api_key"
```

### For Vercel

Add environment variables in Vercel dashboard:

1. Go to Project Settings → Environment Variables
2. Add each variable with its value
3. Redeploy

### For Netlify

Add environment variables in Netlify dashboard:

1. Go to Site Settings → Build & Deploy → Environment
2. Add each variable with its value
3. Trigger new deploy

---

## ⚠️ Security Best Practices

1. **Never commit `.env` to version control**
   - Add `.env` to `.gitignore`
   - Use `.env.example` as a template

2. **Use different keys for development and production**
   - Create separate Supabase projects for dev/prod
   - Use separate Resend API keys

3. **Rotate keys regularly**
   - Update Resend API keys every 90 days
   - Monitor Supabase access logs

4. **Restrict API key permissions**
   - Use Resend API keys with minimal required permissions
   - Enable Supabase RLS policies

---

## 🧪 Testing Your Configuration

### Test Supabase Connection

```javascript
import { supabase } from './src/lib/supabaseClient';

async function testSupabase() {
    const { data, error } = await supabase
        .from('profiles')
        .select('count');
    
    if (error) {
        console.error('Supabase connection failed:', error);
    } else {
        console.log('✅ Supabase connected successfully');
    }
}
```

### Test Resend Email

```javascript
import { sendEmail } from './src/lib/resendClient';

async function testResend() {
    try {
        const result = await sendEmail({
            from: 'test@yourdomain.com',
            to: 'your-email@example.com',
            subject: 'Test Email',
            html: '<p>This is a test email from Godspeed Comms Center</p>'
        });
        console.log('✅ Email sent successfully:', result);
    } catch (error) {
        console.error('Resend email failed:', error);
    }
}
```

---

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section in `COMMS_CENTER_README.md`
2. Verify all environment variables are set correctly
3. Check Supabase and Resend dashboards for error logs
4. Contact support if issues persist

---

**Last Updated**: December 22, 2025
