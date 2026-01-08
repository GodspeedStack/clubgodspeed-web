# Godspeed Basketball - Web Platform

> A comprehensive platform for managing basketball teams, tracking athlete performance, and connecting coaches with parents.

[![Netlify Status](https://img.shields.io/badge/Netlify-Deployed-00C7B7?logo=netlify)](https://www.netlify.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?logo=react)](https://reactjs.org/)

## 📋 Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Deployment](#deployment)
- [Contributing](#contributing)

## ✨ Features

### For Parents
- 📊 **Athlete Dashboard** - View your athlete's performance metrics
- 🎴 **Digital Trading Cards** - Generate and share athlete cards
- 📈 **Performance Tracking** - Track progress over time
- 🔐 **Secure Authentication** - Password-protected parent accounts

### For Coaches
- 👥 **Team Roster Management** - Manage player rosters
- 📊 **War Room Analytics** - Strategic insights and lineup optimization
- 📈 **Performance Grading** - V2 scoring system for player evaluation
- 🎯 **Momentum Tracking** - Identify rising and struggling players

### General
- 📱 **Responsive Design** - Works on all devices
- ♿ **Accessible** - WCAG compliant with keyboard navigation
- 🎨 **Modern UI** - Clean, professional design with Tailwind CSS
- 🚀 **Fast Performance** - Optimized loading and rendering

## 🛠 Tech Stack

### Frontend
- **Framework:** React 18 with Next.js (App Router)
- **Language:** TypeScript & JavaScript (JSX)
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Charts:** Recharts
- **Image Generation:** html2canvas

### Backend
- **Database:** Firebase Firestore
- **Authentication:** Firebase Auth
- **Hosting:** Netlify
- **Build Tool:** Vite

### Development Tools
- **Version Control:** Git & GitHub
- **Package Manager:** npm
- **Code Quality:** ESLint (configured)

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- **Firebase Account** (for backend services)
- **Git** for version control

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/GodspeedStack/clubgodspeed-web.git
   cd clubgodspeed-web
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your Firebase credentials:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## 📁 Project Structure

```
clubgodspeed-web/
├── godspeed-portal/          # Next.js parent portal app
│   ├── app/
│   │   ├── components/       # React components
│   │   ├── context/          # React Context providers
│   │   ├── dashboard/        # Dashboard page
│   │   └── page.tsx          # Login page
│   └── lib/                  # Utility libraries
│       └── firebase.js       # Firebase configuration
│
├── src/                      # Coach portal (Vite/React)
│   ├── components/
│   │   ├── dashboard/        # Dashboard components
│   │   └── modals/           # Modal components
│   ├── data/                 # Seed data and mock data
│   └── pages/                # Page components
│
├── public/                   # Static assets
│   ├── images/               # Image files
│   └── *.html                # Static HTML pages
│
├── netlify.toml              # Netlify configuration
├── firebase.json             # Firebase configuration
├── vite.config.js            # Vite configuration
└── package.json              # Dependencies and scripts
```

## 🔐 Environment Variables

Create a `.env.local` file in the root directory:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

# Optional: Analytics
NEXT_PUBLIC_GA_TRACKING_ID=
```

See `.env.example` for a complete template.

## 💻 Development

### Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm run preview          # Preview production build

# Firebase
npm run seed             # Seed Firestore with sample data

# Code Quality
npm run lint             # Run ESLint (if configured)
npm run format           # Format code (if configured)
```

### Development Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow existing code style
   - Add JSDoc comments for functions
   - Ensure TypeScript types are properly defined

3. **Test your changes**
   - Test on multiple screen sizes
   - Verify keyboard navigation works
   - Check error states

4. **Commit and push**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   git push origin feature/your-feature-name
   ```

5. **Create a Pull Request**
   - Use descriptive PR titles
   - Include screenshots if UI changes
   - Request review from team

## 🚀 Deployment

### Netlify (Automatic)

The site automatically deploys to Netlify when changes are pushed to the main branch.

**Manual Deploy:**
```bash
# Build the project
npm run build

# Deploy to Netlify
netlify deploy --prod
```

### Firebase Hosting (Alternative)

```bash
# Build the project
npm run build

# Deploy to Firebase
firebase deploy
```

## 📊 Key Components

### Parent Portal (`godspeed-portal/`)

**Login Page** (`app/page.tsx`)
- Email/password authentication
- Password reset functionality
- Loading states and error handling

**Dashboard** (`app/dashboard/page.tsx`)
- Lists all linked athletes
- Displays trading cards
- Error recovery with retry

**Trading Card** (`app/components/AthleteTradingCard.tsx`)
- Generate shareable athlete cards
- Download as PNG
- Web Share API integration

**Auth Context** (`app/context/AuthContext.tsx`)
- Global authentication state
- Auto-redirect on logout
- Error handling

### Coach Portal (`src/`)

**Team Roster** (`src/components/dashboard/TeamRoster.jsx`)
- Clickable player list
- Modal with detailed stats
- Keyboard accessible

**War Room** (`src/pages/WarRoom.jsx`)
- Momentum risers analysis
- Rotation risk identification
- Dynamic top 5 lineup

**Athlete Profile Modal** (`src/components/modals/AthleteProfileModal.jsx`)
- Performance graphs
- Game statistics
- Highlights display

## 🎨 Styling Guide

We use **Tailwind CSS** with a custom color scheme:

```css
Primary Blue: #0071e3
Accent Orange: #f59e0b
Background: #f5f5f7
Text: #1d1d1f
```

## ♿ Accessibility

- ✅ Keyboard navigation supported
- ✅ ARIA labels on interactive elements
- ✅ Focus indicators visible
- ✅ Screen reader friendly
- ✅ Color contrast meets WCAG AA standards

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes**
4. **Write clear commit messages**
5. **Submit a pull request**

### Code Style
- Use TypeScript for new components when possible
- Add JSDoc comments for functions
- Follow existing naming conventions
- Keep functions small and focused

### Commit Messages
```
feat: Add new feature
fix: Fix bug
docs: Update documentation
style: Format code
refactor: Refactor code
test: Add tests
chore: Update dependencies
```

## 🐛 Bug Reports

Found a bug? Please open an issue with:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots (if applicable)
- Browser/device information

## 📄 License

This project is proprietary and confidential.

## 👥 Team

**Godspeed Basketball**
- Website: [clubgodspeed.com](https://clubgodspeed.com)
- Email: info@clubgodspeed.com

## 🙏 Acknowledgments

- Firebase for backend infrastructure
- Netlify for hosting
- Tailwind CSS for styling
- The Godspeed Basketball community

---

**Built with ❤️ by the Godspeed team**
