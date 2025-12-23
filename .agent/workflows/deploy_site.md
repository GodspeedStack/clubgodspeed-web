---
description: Deploy the AAU Site to Production using Firebase
---

# Deployment & Backend Setup

This guide ensures the site is production-ready and deployed with a secure backend.

## 1. Prerequisites

- **Node.js** installed.
- **Firebase Account** (Google Account).
- **Domain Name** (purchased via Google Domains, GoDaddy, etc.).

## 2. Backend Setup (Firebase)

We use Firebase for Hosting, Authentication, and Database.

1. **Install Firebase CLI**:

    ```bash
    npm install -g firebase-tools
    ```

2. **Login**:

    ```bash
    firebase login
    ```

3. **Initialize Project** (if not already linked):

    ```bash
    firebase init
    ```

    - Select **Hosting** and **Firestore**.
    - Choose "Use an existing project" (if created) or "Create a new project".
    - Public directory: `.` (Current directory).
    - Configure as single-page app: `No` (since we have multiple HTML files, strictly speaking usually No for pure static multi-page, but Yes if we want client routing. For this simple HTML site, `No` is safer unless we handle routing).
    - File `firebase.json` has been pre-configured for you.

## 3. Domain Configuration

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Select your project -> **Hosting**.
3. Click **Add Custom Domain**.
4. Enter your domain (e.g., `godspeedbasketball.com`).
5. Update your DNS records (A Records) at your registrar (GoDaddy/Google) with the IPs provided by Firebase.
6. SSL Certificates are provisioned automatically (may take up to 24h, usually 1h).

## 4. Deploy

Run the deploy script to push changes live:

```bash
firebase deploy
```

## 5. "Nothing Left to Chance" Checklist

- [ ] **Forms**: Ensure `firestore.rules` allows writes to 'contacts' collection.
- [ ] **Images**: Verify all assets are in `/assets` and paths are relative.
- [ ] **SEO**: Check `<title>` and `<meta name="description">` on every page.
- [ ] **Mobile**: Test responsive views on actual device.
