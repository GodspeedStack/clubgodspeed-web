# Domain Setup Guide: clubgodspeed.com

## Overview

This guide explains how to configure `clubgodspeed.com` to point to the Vercel deployment, ensuring the domain shows the same content as the GitHub source of truth.

## Source of Truth Flow

```
GitHub (main branch) 
    ↓ (auto-deploy on push)
Vercel (clubgodspeed-web.vercel.app)
    ↓ (DNS points here)
Domain (clubgodspeed.com)
```

**Important Notes:**
- `clubgodspeed.com` is the production domain (you own this)
- `clubgodspeed-web.vercel.app` is the Vercel preview URL
- `www.godspeed.com` is NOT owned by this project (ignore it)

## Step-by-Step Setup

### Step 1: Add Domain in Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select the `clubgodspeed-web` project
3. Navigate to **Settings** → **Domains**
4. Click **"Add"** button
5. Enter: `clubgodspeed.com`
6. (Optional) Also add: `www.clubgodspeed.com` if you want www subdomain
7. Vercel will provide DNS records to configure

### Step 2: Update DNS Records

At your domain registrar (GoDaddy, Google Domains, Namecheap, etc.):

#### Remove Old Records

Delete any records pointing to old hosting:
- `A` records pointing to Netlify IPs
- `A` records pointing to Firebase IPs
- `CNAME` records pointing to old hosting services

#### Add Vercel DNS Records

Vercel will show you the exact records needed. Typically:

**For root domain (`clubgodspeed.com`):**
```
Type: A
Host: @ (or blank/root)
Value: [IP address provided by Vercel]
```

**For www subdomain (`www.clubgodspeed.com`):**
```
Type: CNAME
Host: www
Value: cname.vercel-dns.com (or value provided by Vercel)
```

**Important:** Use the exact values Vercel provides in the dashboard, as they may differ from examples.

### Step 3: Wait for DNS Propagation

- DNS changes can take **1-24 hours** to propagate globally
- Usually takes **1-2 hours**
- Check propagation status at: https://www.whatsmydns.net/

### Step 4: Verify Configuration

1. **Check DNS Propagation:**
   - Visit: https://www.whatsmydns.net/#A/clubgodspeed.com
   - Should show Vercel IP addresses

2. **Check Vercel Dashboard:**
   - Go to Settings → Domains
   - Status should show "Valid Configuration"
   - SSL certificate status (may take up to 24h to provision)

3. **Test the Domain:**
   - Visit: `https://clubgodspeed.com`
   - Should show the same content as `https://clubgodspeed-web.vercel.app`
   - Both should match the GitHub `main` branch

4. **Verify SSL Certificate:**
   - Vercel automatically provisions SSL certificates
   - May take up to 24 hours after DNS is configured
   - Check in Vercel dashboard → Domains → SSL status

## Troubleshooting

### Domain Shows Different Content Than Vercel

**Possible Causes:**
1. DNS not pointing to Vercel yet
2. DNS still propagating (wait 1-24 hours)
3. Browser cache (hard refresh: `Cmd + Shift + R`)

**Solutions:**
- Check DNS records at your registrar
- Verify DNS propagation with whatsmydns.net
- Check Vercel dashboard → Domains for configuration status
- Clear browser cache or use incognito mode

### SSL Certificate Not Active

**Solution:**
- Wait up to 24 hours after DNS is configured
- Vercel automatically provisions SSL certificates
- Check status in Vercel dashboard → Domains

### Domain Not Resolving

**Solution:**
- Verify DNS records are correct at your registrar
- Check DNS propagation status
- Ensure you're using the exact values Vercel provided
- Contact your domain registrar support if issues persist

## Expected Outcome

After successful configuration:

- ✅ `clubgodspeed.com` → Points to Vercel → Shows latest code from GitHub
- ✅ `www.clubgodspeed.com` → Points to Vercel (if configured)
- ✅ `clubgodspeed-web.vercel.app` → Vercel preview (always in sync)
- ✅ All three URLs show identical content
- ✅ SSL certificates active (HTTPS working)
- ✅ Auto-deploys from GitHub `main` branch

## Maintenance

**No ongoing maintenance needed:**
- Vercel automatically deploys when you push to GitHub
- Domain automatically shows the latest deployment
- SSL certificates auto-renew
- DNS records remain stable

## Need Help?

If you encounter issues:
1. Check Vercel dashboard → Domains for status
2. Verify DNS records at your registrar
3. Check DNS propagation status
4. Review Vercel documentation: https://vercel.com/docs/concepts/projects/domains
