# TODO List - Godspeed Basketball Site

## 🔴 CRITICAL - Must Do First

### 1. Backend Setup (Supabase)

- [x] Create Supabase account at <https://app.supabase.com>
- [x] Create new project named "Godspeed Basketball"
- [x] Get Project URL and anon public key from Settings → API
- [x] Run database migrations in order:
  - [x] `supabase/migrations/001_comms_center_schema.sql`
  - [x] `supabase/migrations/002_ecommerce_schema.sql`
  - [x] `supabase/migrations/003_store_schema.sql`
  - [x] `supabase/migrations/004_supplier_sync.sql`
  - [x] `supabase/migrations/005_emergency_product_seed.sql`
  - [x] `supabase/migrations/006_parent_portal_training.sql`
  - [x] `supabase/migrations/007_product_variants_rls_fix.sql`
  - [x] `supabase/migrations/008_seed_training_data.sql` (optional - adds sample data)
- [x] Copy `.env.example` to `.env`
- [x] Add Supabase credentials to `.env`:
  - `VITE_SUPABASE_URL` (Configured)
  - `VITE_SUPABASE_ANON_KEY` (Configured)
- [x] Verify setup by running `verifySetup()` (Connection Confirmed)

**Reference:** See `DO_THIS_NOW.md` for detailed 3-step guide

---

## 🟡 HIGH PRIORITY - Core Features

### 2. Checkout Flow Implementation

- [x] Implement checkout functionality in `src/components/CartSidebar.jsx`
  - Replaced placeholder alert with functional UI
  - Added shipping and payment forms (Mock)
  - Implemented order placement simulation
  - Need to integrate with payment processor (Stripe recommended) - Backend required for full integration
  - Create checkout page/flow - Done (Sidebar)
  - Handle order processing and confirmation - Done (Simulation)

### 3. Environment Variables Configuration

- [x] Verify `.env` file exists and is in `.gitignore`
- [ ] Add Resend API key for email functionality (if using Comms Center):
  - `VITE_RESEND_API_KEY=re_your_api_key_here`
- [ ] For production deployment, add environment variables to:
  - [ ] Vercel dashboard (if deploying to Vercel)
  - [ ] Netlify dashboard (if deploying to Netlify)

### 4. Payment Integration

- [ ] Set up Stripe account (or preferred payment processor)
- [ ] Add Stripe API keys to environment variables
- [ ] Implement payment processing for:
  - [ ] Training package purchases
  - [ ] Tuition payments
  - [ ] Travel trip payments
  - [ ] Store/e-commerce checkout

---

## 🟢 MEDIUM PRIORITY - Enhancements

### 5. Calendar Features

- [ ] Implement calendar filtering by athlete
- [ ] Add athlete selector dropdown functionality
- [ ] Test PostMessage communication between iframe and parent window
- [ ] Filter training sessions by enrolled athletes
- [ ] Display only relevant events for logged-in parent's athletes

### 6. Mobile Responsiveness

- [ ] Test on various mobile devices
- [ ] Verify touch targets are minimum 44px
- [ ] Test mobile menu functionality
- [ ] Verify signature pad works on touch devices
- [ ] Test portal views on mobile screens

### 7. Training Dashboard Enhancements

- [ ] Complete training hours calculation (verify database triggers work)
- [ ] Add training session booking functionality
- [ ] Implement training history/analytics view
- [ ] Add ability to purchase more training hours from dashboard

### 8. Document Management

- [ ] Verify PDF generation works for receipts and invoices
- [ ] Test document signing flow end-to-end
- [ ] Store signed documents in Supabase
- [ ] Add ability to view/download previously signed documents

---

## 🔵 LOW PRIORITY - Future Features

### 9. Email Notifications (Comms Center)

- [ ] Set up Resend webhook integration for email tracking
- [ ] Implement email notifications for:
  - [ ] Document signing reminders
  - [ ] Payment due reminders
  - [ ] Training session reminders
  - [ ] Travel trip updates

### 10. Analytics & Reporting

- [ ] Coach analytics dashboard
- [ ] Training session analytics
- [ ] Player performance tracking
- [ ] Export functionality (CSV/PDF)

### 11. Advanced Features

- [ ] Training session booking system
- [ ] Message templates for coaches
- [ ] Scheduled messages
- [ ] File attachments in communications
- [ ] Rich text editor (WYSIWYG) for messages
- [ ] "Resend to Unopened" functionality

### 12. Testing & Quality Assurance

- [ ] End-to-end testing of parent portal flow
- [ ] Test authentication (login/logout)
- [ ] Test all document signing workflows
- [ ] Test cart functionality
- [ ] Test payment processing
- [ ] Cross-browser testing
- [ ] Performance testing

---

## 📋 DEPLOYMENT CHECKLIST

### Pre-Deployment

- [ ] All environment variables configured
- [ ] Database migrations run successfully
- [ ] Test all critical user flows
- [ ] Verify responsive design on mobile
- [ ] Check all links and navigation

### Deployment Steps

- [ ] Choose deployment platform (Vercel/Netlify)
- [ ] Add environment variables to deployment platform
- [ ] Configure build settings
- [ ] Set up custom domain (if applicable)
- [ ] Configure DNS records
- [ ] Test production deployment

### Post-Deployment

- [ ] Verify site loads correctly
- [ ] Test authentication in production
- [ ] Verify database connections
- [ ] Test payment processing (use test mode first)
- [ ] Monitor error logs
- [ ] Set up error tracking (e.g., Sentry)

---

## 🔧 MAINTENANCE & IMPROVEMENTS

### Code Quality

- [ ] Remove console.log statements from production code
- [ ] Add error handling for all async operations
- [ ] Add loading states for all data fetching
- [ ] Improve error messages for users
- [ ] Add form validation where needed

### Documentation

- [ ] Update README with current setup instructions
- [ ] Document API endpoints (if any)
- [ ] Create user guide for parent portal
- [ ] Document deployment process

### Security

- [ ] Review and test RLS (Row Level Security) policies
- [ ] Verify authentication is working correctly
- [ ] Test authorization (users can only see their data)
- [ ] Review API keys and secrets management
- [ ] Set up rate limiting (if needed)

---

## 📝 NOTES

- Most backend code is already complete - focus on setup and configuration
- See `DO_THIS_NOW.md` for the simplest setup guide
- See `QUICK_START.md` for more detailed instructions
- See `docs/BACKEND_SETUP_GUIDE.md` for comprehensive setup guide
- Check `docs/BACKEND_IMPLEMENTATION_SUMMARY.md` for what's already done

---

**Last Updated:** Based on codebase analysis
**Status:** Ready for backend setup and feature implementation
