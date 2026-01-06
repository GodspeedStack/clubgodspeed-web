# Email Testing Guide

## Quick Start

Your Resend API key has been added to `.env`. Follow these steps to test email functionality:

### 1. Start Development Server

Since this is a static site, you have a few options:

#### Option A: Use Vite (Recommended for env vars)
```bash
# Install Vite if not already installed
npm install -D vite

# Start dev server (loads .env automatically)
npx vite
```

#### Option B: Use Python Simple Server
```bash
# Python 3
python3 -m http.server 8000

# Then manually set the API key in browser console:
# window.VITE_RESEND_API_KEY = 're_ipQEUbGC_QJi6FrVJJiqCeRsUSAt6iaX9';
```

#### Option C: Use Node.js http-server
```bash
# Install http-server
npm install -g http-server

# Start server
http-server -p 8000
```

### 2. Test Email Functionality

1. **Open Coach Portal**
   - Navigate to `http://localhost:8000/coach-portal.html` (or your server port)

2. **View Player Report**
   - Click on any player in the roster
   - The player report modal will open

3. **Send Test Email**
   - Click "Email Training Report" or "Email Practice Info"
   - Check browser console for any errors
   - Check Resend dashboard for email status

### 3. Verify Email Delivery

1. **Check Resend Dashboard**
   - Go to https://resend.com/emails
   - You should see sent emails listed

2. **Check Recipient Email**
   - Emails sent from `onboarding@resend.dev` may go to spam
   - Check spam/junk folder
   - For production, verify your domain to improve deliverability

## Development vs Production

### Development (Current Setup)
- **From Address**: `onboarding@resend.dev` (Resend test domain)
- **Limitations**: 
  - May go to spam
  - Limited to 100 emails/day
  - Not ideal for production

### Production Setup

1. **Verify Your Domain in Resend**
   - Go to https://resend.com/domains
   - Add your domain (e.g., `godspeedbasketball.com`)
   - Add DNS records to your domain registrar
   - Wait for verification

2. **Update From Address**
   - Edit `coach-portal.js` line ~2277
   - Change from: `'onboarding@resend.dev'`
   - To: `'Godspeed Basketball <notifications@yourdomain.com>'`

3. **Use Backend API (Recommended)**
   - For production, don't expose Resend API key in frontend
   - Create a backend endpoint that calls Resend
   - Update `sendEmailViaResend()` to call your API instead

## Troubleshooting

### "Resend API key not configured"
- **Solution**: Make sure you're using Vite dev server or manually set `window.VITE_RESEND_API_KEY` in browser console

### "CORS error" when sending email
- **Solution**: Resend API may block direct browser calls
- **Workaround**: Use a backend API endpoint or CORS proxy (dev only)

### Emails not received
- Check spam folder
- Verify email address is correct
- Check Resend dashboard for delivery status
- For production, verify your domain

### API Key Not Loading
If using static HTML without Vite:
```javascript
// Open browser console and run:
window.VITE_RESEND_API_KEY = 're_ipQEUbGC_QJi6FrVJJiqCeRsUSAt6iaX9';
// Then try sending email again
```

## Next Steps

1. ✅ Resend API key added to `.env`
2. ⏭️ Start development server
3. ⏭️ Test email functionality
4. ⏭️ Verify domain in Resend (for production)
5. ⏭️ Update "from" address to verified domain

## Security Note

⚠️ **Important**: The current implementation exposes the Resend API key in client-side code. This is fine for development but **NOT recommended for production**.

**Production Solution**: Create a backend API endpoint that:
- Stores Resend API key on server only
- Accepts email requests from frontend
- Calls Resend API from server
- Returns success/error status

Example backend endpoint (Node.js/Express):
```javascript
app.post('/api/send-email', async (req, res) => {
  const { to, subject, html } = req.body;
  
  const result = await resend.emails.send({
    from: 'Godspeed Basketball <notifications@godspeedbasketball.com>',
    to,
    subject,
    html
  });
  
  res.json(result);
});
```
