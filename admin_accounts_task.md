# Admin Accounts Implementation for Coach Portal

## Objective

Implement an administrative view within the Coach Portal to allow coaches to view player and parent accounts.

## Changes Implemented

### 1. Data Layer (`portal-data.js`)

- Added mock `accounts` data to `GODSPEED_DATA` containing parent information:
  - Parent Name
  - Email & Phone
  - Associated Athletes (linked via ID)
  - Account Status (Active, Past Due, Pending)
  - Current Balance

### 2. Frontend Structure (`coach-portal.html`)

- **Fixed Navigation Issue**: Updated the "Coach Portal" link in `index.html` footer to correctly point to `coach-portal.html`.
- **Structural Fixes**: Resolved a critical HTML nesting issue where dashboard views (Schedule, Logistics, Post-Game) were incorrectly nested inside the Video Player Modal. Moved these views to the main dashboard container.
- **New View Container**: Added `#accounts-view` to the main dashboard area to house the accounts table.

### 3. Logic & Rendering (`coach-portal.js`)

- **Sidebar Navigation**: Updated `initDashboard` to dynamically inject the "Organization" section with an "Accounts" link into the sidebar.
- **View Switching**: Updated `switchTeamView` to handle the `'accounts'` view state (hiding team-specific tabs, setting title).
- **Table Rendering**: Implemented `renderCoachAccounts()` to generate a responsive table displaying:
  - **Parent Info**: Name and contact details.
  - **Athletes**: List of associated children.
  - **Status**: Color-coded badges (Green for Active, Red for Past Due, Yellow for Pending).
  - **Balance**: formatted currency display.

## Verification

- Confirmed navigation from Home Page -> Coach Portal works.
- Confirmed Login flow.
- Confirmed "Accounts" link appears in the sidebar.
- Confirmed Accounts list renders correctly with mock data (e.g., James Parent, Sarah Smith).
