# Email Setup Guide - Coach Portal

This guide explains how to set up email functionality for sending training reports and practice info to parents.

## Overview

The coach portal can send two types of emails to parents:
1. **Training Reports** - Includes hours, attendance, sessions, and coach feedback
2. **Practice Info** - Includes practice performance grades and feedback

## Setup Requirements

### 1. Resend API Key

You need a Resend API key to send emails:

1. **Sign up for Resend**: Go to [https://resend.com](https://resend.com)
2. **Create API Key**:
   - Go to API Keys section
   - Click "Create API Key"
   - Copy the key (starts with `re_`)
3. **Add to .env file**:
   ```env
   VITE_RESEND_API_KEY=re_your_api_key_here
   ```

### 2. Verify Domain (Production)

For production use, you need to verify your sending domain in Resend:
1. Go to Resend Dashboard → Domains
2. Add your domain (e.g., `godspeedbasketball.com`)
3. Add the DNS records shown to your domain registrar
4. Wait for verification

### 3. Update Email "From" Address

In `coach-portal.js`, update the `from` address in `sendEmailViaResend()`:
```javascript
from: 'Godspeed Basketball <notifications@godspeedbasketball.com>'
```

Replace with your verified domain.

## Usage

### Individual Emails

1. **Open Coach Portal** and log in
2. **View Player Report** - Click on any player in the roster
3. **Click Email Buttons**:
   - "Email Training Report" - Sends training report
   - "Email Practice Info" - Sends practice info

### Bulk Emails

1. **Go to Admin Section** - Click "Accounts" in the sidebar (admin only)
2. **Click Bulk Email Buttons**:
   - "Send Training Reports to All" - Sends to all parents
   - "Send Practice Info to All" - Sends to all parents

## Email Content

### Training Report Includes:
- Hours purchased, used, and remaining
- Recent attendance records
- Upcoming training sessions
- Coach notes/feedback
- Link to parent portal

### Practice Info Includes:
- Average practice score
- Recent practice performance grades
- Effort and comp scores
- Coach feedback for each practice
- Link to full practice history

## Troubleshooting

### "Resend API key not configured"
- Check `.env` file has `VITE_RESEND_API_KEY`
- Restart development server after adding key
- Verify key starts with `re_`

### "CORS error"
- Resend API may block direct browser calls
- Solution: Create a backend API endpoint that calls Resend
- Or use a CORS proxy (not recommended for production)

### "Email data prepared" message
- Email was generated but not sent
- Check browser console for email data
- Can be manually sent via Resend dashboard

### Emails not received
- Check spam folder
- Verify domain is verified in Resend
- Check Resend dashboard for delivery status
- Verify parent email addresses are correct

## Security Notes

⚠️ **Important**: Exposing Resend API key in client-side code is not ideal for production.

**Recommended Production Setup:**
1. Create a backend API endpoint (e.g., `/api/send-email`)
2. Store Resend API key on server only
3. Coach portal calls your API endpoint
4. API endpoint calls Resend

**Example API Endpoint** (Node.js/Express):
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

## Testing

1. **Test with your own email first**
2. **Check Resend dashboard** for delivery status
3. **Verify email formatting** looks correct
4. **Test on mobile** to ensure responsive design

## Support

For issues:
- Check Resend dashboard logs
- Check browser console for errors
- Verify all environment variables are set
- Ensure domain is verified (for production)
