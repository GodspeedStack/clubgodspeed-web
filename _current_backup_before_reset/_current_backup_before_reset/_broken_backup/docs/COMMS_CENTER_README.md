# 📬 Godspeed Comms Center

**Secure internal messaging system for Coach-to-Parent communication**

## 🎯 Features

### ✅ Dual Delivery System

- **In-App Messages**: Persistent inbox in Parent Portal
- **Email Notifications**: Automatic email delivery via Resend API
- **Flexible Delivery**: Choose email-only, in-app only, or both

### 📊 Smart Analytics & Tracking

- **Read Status**: Auto-mark as read when message is viewed in-app
- **Email Tracking**: Resend webhooks for email open/click tracking (V2)
- **Coach Dashboard**: Real-time "Read Rate" display (e.g., "12/15 Opened")
- **Resend to Unopened**: Target parents who haven't read messages

### 🔒 Permission System ("BCC Rule")

- **Coaches**: Broadcast to "All Parents" or specific teams
- **Parents**: Reply 1-on-1 to coach only (no "Reply All")
- **Row Level Security**: Supabase RLS policies enforce permissions

## 🏗️ Architecture

### Database Schema (Supabase)

```sql
messages
├── id (UUID, PK)
├── sender_id (UUID, FK → auth.users)
├── subject (TEXT)
├── body (TEXT)
├── type (VARCHAR: 'email' | 'internal' | 'both')
├── sent_at (TIMESTAMP)
├── recipient_count (INTEGER)
└── read_count (INTEGER)

message_recipients
├── id (UUID, PK)
├── message_id (UUID, FK → messages)
├── user_id (UUID, FK → auth.users)
├── status (VARCHAR: 'sent' | 'delivered' | 'read' | 'failed')
├── sent_at (TIMESTAMP)
├── delivered_at (TIMESTAMP)
├── read_at (TIMESTAMP)
├── email_id (TEXT) -- Resend email ID
└── email_opened_at (TIMESTAMP)

message_replies
├── id (UUID, PK)
├── parent_message_id (UUID, FK → messages)
├── sender_id (UUID, FK → auth.users)
├── recipient_id (UUID, FK → auth.users)
├── body (TEXT)
├── read_at (TIMESTAMP)
└── created_at (TIMESTAMP)
```

### Components

1. **CoachMessageComposer** (`src/components/CoachMessageComposer.jsx`)
   - Rich message composer with recipient selection
   - Subject and body fields
   - Delivery method selector
   - Sends to Supabase + Resend

2. **ParentInbox** (`src/components/ParentInbox.jsx`)
   - Message list with read/unread visual distinction
   - Auto-mark as read on view
   - 1-on-1 reply functionality
   - Real-time updates via Supabase subscriptions

## 🚀 Setup Instructions

### 1. Install Dependencies

```bash
npm install @supabase/supabase-js resend
```

### 2. Set Up Supabase

#### A. Create Supabase Project

1. Go to <https://app.supabase.com>
2. Create a new project
3. Copy your project URL and anon key

#### B. Run Database Migration

1. Go to SQL Editor in Supabase dashboard
2. Copy contents of `supabase/migrations/001_comms_center_schema.sql`
3. Execute the SQL

### 3. Set Up Resend

#### A. Create Resend Account

1. Go to <https://resend.com>
2. Sign up for an account
3. Verify your sending domain

#### B. Get API Key

1. Go to <https://resend.com/api-keys>
2. Create a new API key
3. Copy the key (starts with `re_`)

### 4. Configure Environment Variables

Create a `.env` file in your project root:

```bash
# Copy from .env.example
cp .env.example .env
```

Fill in your actual values:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Resend
VITE_RESEND_API_KEY=re_your_api_key_here
```

### 5. Update Your User Profiles Table

Ensure your `profiles` table has a `role` column:

```sql
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS role VARCHAR(20) 
CHECK (role IN ('coach', 'parent', 'admin'));
```

## 📝 Usage

### Coach: Send a Message

```jsx
import CoachMessageComposer from './components/CoachMessageComposer';

function CoachDashboard() {
    const coachId = 'current-coach-user-id';
    
    const handleMessageSent = (message) => {
        console.log('Message sent:', message);
        // Refresh analytics, show success toast, etc.
    };
    
    return (
        <CoachMessageComposer 
            coachId={coachId}
            onMessageSent={handleMessageSent}
        />
    );
}
```

### Parent: View Inbox

```jsx
import ParentInbox from './components/ParentInbox';

function ParentPortal() {
    const parentId = 'current-parent-user-id';
    
    return (
        <ParentInbox parentId={parentId} />
    );
}
```

## 🎨 Design System

All components follow the **Godspeed Design System**:

- **Colors**:
  - Primary: `#0071e3` (Godspeed Blue)
  - Text (Dark): `#1d1d1f`
  - Text (Muted): `#86868b`
  - Unread: `#FFFFFF` (Bright White, Bold)
  - Read: `#888888` (Dimmed Grey)

- **Typography**:
  - Font Family: `Inter, sans-serif`
  - Headers: 800 weight, uppercase, -0.02em letter-spacing
  - Labels: 700 weight, 0.05em letter-spacing

- **Components**:
  - Glass morphism cards
  - 24px border radius
  - Subtle shadows and borders
  - Smooth transitions

## 🔄 Real-Time Updates

The Parent Inbox uses Supabase real-time subscriptions to automatically show new messages without refreshing:

```javascript
const subscription = supabase
    .channel('parent_messages')
    .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'message_recipients',
        filter: `user_id=eq.${parentId}`
    }, handleNewMessage)
    .subscribe();
```

## 📧 Email Template

Emails are sent with a professional HTML template featuring:

- Godspeed Basketball branding
- Responsive design
- Call-to-action button to Parent Portal
- Clean, modern styling

## 🔐 Security

### Row Level Security (RLS)

All tables have RLS policies enabled:

- **Messages**: Coaches can only view/edit their own messages
- **Recipients**: Parents can only view messages sent to them
- **Replies**: Users can only view replies they sent or received

### Authentication

Uses Supabase Auth with role-based access control:

- `isCoach()` - Check if user is a coach
- `isParent()` - Check if user is a parent

## 📊 Analytics (Future Enhancement)

### Coach Dashboard Metrics

- Total messages sent
- Average read rate
- Fastest/slowest read times
- Unopened message list with "Resend" button

### Resend Webhook Integration (V2)

```javascript
// Webhook endpoint to receive Resend events
POST /api/webhooks/resend
{
  "type": "email.opened",
  "data": {
    "email_id": "...",
    "opened_at": "..."
  }
}
```

## 🐛 Troubleshooting

### Messages not sending?

1. Check Supabase connection in browser console
2. Verify RLS policies allow inserts
3. Check Resend API key is valid

### Emails not delivering?

1. Verify domain is verified in Resend
2. Check Resend dashboard for delivery status
3. Review email logs in Resend

### Read tracking not working?

1. Ensure `markAsRead()` is called on message view
2. Check Supabase RLS allows updates to `message_recipients`
3. Verify trigger function is working

## 📦 Dependencies

```json
{
  "@supabase/supabase-js": "^2.39.0",
  "resend": "^3.0.0",
  "react": "^18.2.0"
}
```

## 🚀 Deployment

### Environment Variables in Production

Set these in your hosting platform (Vercel, Netlify, Firebase, etc.):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_RESEND_API_KEY=...
```

### Build Command

```bash
npm run build
```

## 📄 License

© 2025 Godspeed Basketball. All rights reserved.

---

**Built with ❤️ for the Godspeed Basketball community**
