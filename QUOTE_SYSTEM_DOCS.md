# Godspeed Quote Design System

## Overview

A beautiful, personalized quote system that displays contextual quotes based on user profile. Quotes appear in elegant containers with scroll-based reveal on web, and are optimized for mobile (reduced size, never over photos).

## Features

### 🎯 User Profile Detection
- Automatically detects user role (Coach, Parent, Athlete, Admin, Guest)
- Integrates with security/RBAC system
- Personalizes quotes based on user needs and context

### 🎨 Beautiful Container Design
- Small, elegant quote containers
- Multiple color themes (Primary, Success, Warning, Purple, Rose)
- Consistent UI with variable colors throughout user flow
- Subtle animations and hover effects

### 📱 Responsive Behavior
- **Web**: Quotes appear on scroll (not over images until scrolled)
- **Mobile**: Reduced size, never display over photos, immediate visibility
- Smart placement logic to avoid image overlap

### 🎭 Personalized Quotes
- **Coaches**: Leadership, strategy, development, motivation
- **Parents**: Support, growth, encouragement, perspective
- **Athletes**: Discipline, perseverance, excellence, growth
- **Admins**: Vision, leadership, excellence, impact
- **Guests**: General inspiration and motivation

## Files

- `quote-system.js` - Main quote system with user profiling
- `quote-system.css` - Beautiful container styles and responsive design
- Integrated into: `index.html`, `training.html`, `aau.html`, `about.html`

## Usage

The system automatically initializes on page load. No manual setup required.

### Manual Control (if needed)

```javascript
// Re-initialize quotes
window.GodspeedQuotes.init();

// Get current user profile
const profile = window.GodspeedQuotes.detectUserProfile();

// Get quotes for a profile
const quotes = window.GodspeedQuotes.getQuotesForProfile(profile);
```

## Design Principles

1. **Never Over Images (Mobile)**: Quotes are placed strategically to avoid image overlap on mobile
2. **Scroll Reveal (Web)**: Quotes only appear after user scrolls, ensuring they don't cover hero images
3. **Small & Elegant**: Compact containers that don't overwhelm content
4. **Consistent UI**: Same container style with variable colors
5. **User-Centric**: Quotes match user role and needs

## Color Themes

- **Primary** (Blue): Default, coaching context
- **Success** (Green): Parenting context
- **Warning** (Amber): Training context
- **Purple**: General inspiration
- **Rose**: Motivation

## Mobile Optimization

- Reduced padding and font sizes
- Immediate visibility (no scroll delay)
- Never placed over images
- Optimized touch targets
- Simplified animations

## Accessibility

- Respects `prefers-reduced-motion`
- High contrast mode support
- Semantic HTML structure
- Screen reader friendly

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Chrome Mobile)
- Graceful degradation for older browsers
