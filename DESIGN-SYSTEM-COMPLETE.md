# Godspeed Basketball - Complete Design System

**Version:** 2.0 | **Status:** Active | **Last Updated:** 2025

Comprehensive design system documentation covering layout, typography, spacing, padding, border radius, and iOS-inspired styling principles.

---

## 1. Layout System

### Container Widths

| Class | Width | Use Case |
|-------|-------|----------|
| `max-w-7xl` | 1280px | Main content sections, full-width layouts |
| `max-w-6xl` | 1152px | Medium content sections |
| `max-w-4xl` | 896px | Narrow content, forms, centered text |
| `max-w-2xl` | 672px | Single column content, testimonials |

**Standard Pattern:**
```html
<div class="max-w-7xl mx-auto px-6">
  <!-- Content -->
</div>
```

### Grid Patterns

**3-Column Grid (Most Common):**
```html
<div class="grid md:grid-cols-3 gap-8">
  <!-- Cards -->
</div>
```

**2-Column Grid:**
```html
<div class="grid md:grid-cols-2 gap-10">
  <!-- Content -->
</div>
```

**Responsive Grid:**
- Mobile: Single column (default)
- Tablet: `md:grid-cols-2` or `md:grid-cols-3` (≥768px)
- Desktop: `lg:grid-cols-4` (≥1024px)

### Section Spacing

| Class | Vertical Padding | Use Case |
|-------|------------------|----------|
| `py-24` | 96px (48px top/bottom) | Standard sections |
| `py-32` | 128px (64px top/bottom) | Hero sections, major breaks |
| `py-16` | 64px (32px top/bottom) | Compact sections, footers |
| `pt-20 pb-16` | 80px top, 64px bottom | Asymmetric spacing |

**Standard Section Pattern:**
```html
<section class="py-24 bg-gray-50">
  <div class="max-w-7xl mx-auto px-6">
    <!-- Content -->
  </div>
</section>
```

### Horizontal Padding

| Class | Padding | Use Case |
|-------|---------|----------|
| `px-6` | 24px | Standard section padding |
| `px-8` | 32px | Card internal padding |
| `px-10` | 40px | Large card padding |
| `px-12` | 48px | CTA button padding |

---

## 2. Typography Hierarchy

### Font Family
- **Primary:** `'Inter', sans-serif`
- **Weights Available:** 400 (normal), 600 (semibold), 700 (bold), 900 (black)

### Type Scale

#### Hero Titles
```html
<h1 class="text-6xl md:text-8xl font-black uppercase leading-[0.9]">
  HEADLINE
</h1>
```
- **Mobile:** `text-6xl` (60px)
- **Desktop:** `text-8xl` (96px)
- **Weight:** `font-black` (900)
- **Transform:** `uppercase`
- **Line Height:** `leading-[0.9]` (tight)

#### Section Titles
```html
<h2 class="text-4xl md:text-5xl font-black uppercase mb-6">
  SECTION TITLE
</h2>
```
- **Mobile:** `text-4xl` (36px)
- **Desktop:** `text-5xl` (48px)
- **Weight:** `font-black` (900)
- **Transform:** `uppercase`
- **Spacing:** `mb-6` (24px bottom margin)

#### Card Titles
```html
<h3 class="text-2xl font-black uppercase mb-4 text-gray-900">
  CARD TITLE
</h3>
```
- **Size:** `text-2xl` (24px)
- **Weight:** `font-black` (900)
- **Transform:** `uppercase`
- **Spacing:** `mb-4` (16px bottom margin)

#### Body Text
```html
<p class="text-base leading-relaxed text-gray-600">
  Body text content
</p>
```
- **Sizes:**
  - `text-sm` (14px) - Small text, captions
  - `text-base` (16px) - Standard body text
  - `text-lg` (18px) - Large body text
- **Line Height:** `leading-relaxed` (1.625)
- **Colors:**
  - `text-gray-900` - Primary text
  - `text-gray-600` - Secondary text
  - `text-gray-400` - Subtle text

#### Subtle Text
```html
<p class="text-sm text-gray-400">
  Subtle supporting text
</p>
```

### Typography Utilities

| Class | Effect |
|-------|--------|
| `uppercase` | All caps transformation |
| `tracking-tight` | Tighter letter spacing |
| `tracking-wider` | Wider letter spacing |
| `font-black` | 900 weight |
| `font-bold` | 700 weight |
| `font-semibold` | 600 weight |

---

## 3. Spacing System

### Tailwind Spacing Scale

| Class | Pixels | Use Case |
|-------|--------|----------|
| `gap-0.5` | 2px | Minimal spacing |
| `gap-1` | 4px | Tight spacing |
| `gap-2` | 8px | Small spacing |
| `gap-3` | 12px | Medium-small spacing |
| `gap-4` | 16px | Standard spacing |
| `gap-6` | 24px | Medium spacing |
| `gap-8` | 32px | Large spacing (most common) |
| `gap-10` | 40px | Extra large spacing |
| `gap-12` | 48px | Maximum spacing |

### Margin Standards

| Class | Pixels | Use Case |
|-------|--------|----------|
| `mb-4` | 16px | Card title bottom margin |
| `mb-6` | 24px | Section title bottom margin |
| `mb-8` | 32px | Large element spacing |
| `mb-10` | 40px | Extra large spacing |
| `mb-20` | 80px | Section header spacing |

### Spacing Patterns

**Card Internal Spacing:**
```html
<div class="p-10">
  <h3 class="mb-4">Title</h3>
  <p class="mb-6">Description</p>
  <ul class="mb-10">List</ul>
  <button>Action</button>
</div>
```

**List Item Spacing:**
```html
<ul class="space-y-3">
  <li>Item 1</li>
  <li>Item 2</li>
</ul>
```

---

## 4. Padding Standards

### Component Padding

| Component | Class | Pixels | Notes |
|-----------|-------|--------|-------|
| **Cards** | `p-10` | 40px all sides | Standard card padding |
| **Large Cards** | `p-12` | 48px all sides | Feature cards |
| **Buttons (Primary)** | `px-8 py-4` | 32px × 16px | Standard CTA buttons |
| **Buttons (Small)** | `px-6 py-2` | 24px × 8px | Nav buttons |
| **Buttons (Large)** | `px-12 py-5` | 48px × 20px | Hero CTAs |
| **Form Inputs** | `p-4` | 16px all sides | Input fields |
| **Sections** | `py-24 px-6` | 96px × 24px | Standard sections |

### Padding Examples

**Card Pattern:**
```html
<div class="bg-white p-10 rounded-3xl">
  <!-- 40px padding on all sides -->
</div>
```

**Button Pattern:**
```html
<button class="px-8 py-4 bg-blue-600 rounded-full">
  <!-- 32px horizontal, 16px vertical -->
</button>
```

**Section Pattern:**
```html
<section class="py-24 px-6">
  <!-- 96px vertical, 24px horizontal -->
</section>
```

---

## 5. Border Radius (iOS-Inspired)

### Radius Scale

| Class | Pixels | Use Case |
|-------|--------|----------|
| `rounded-full` | 9999px | Buttons, badges, pills |
| `rounded-3xl` | 24px | Large cards, containers |
| `rounded-2xl` | 16px | Medium cards, images |
| `rounded-xl` | 12px | Small cards |
| `rounded-lg` | 8px | Subtle rounding, images |
| `rounded-md` | 6px | Minimal rounding |
| `rounded` | 4px | Very subtle rounding |

### Component Radius Standards

**Buttons:**
```html
<button class="rounded-full">
  <!-- Always pill-shaped -->
</button>
```

**Cards:**
```html
<div class="rounded-3xl">
  <!-- Large, iOS-like corners -->
</div>
```

**Images:**
```html
<img class="rounded-lg" />
<!-- or -->
<img class="rounded-2xl" />
```

**Badges/Pills:**
```html
<span class="px-4 py-2 rounded-full">
  Badge
</span>
```

### iOS Design Philosophy
- **Prefer rounded over sharp:** Always use at least `rounded-lg` (8px)
- **Pill shapes for interactive:** All buttons use `rounded-full`
- **Generous radius:** Cards use `rounded-3xl` (24px) for modern feel
- **Consistent application:** Same radius for similar components

---

## 6. Shadow System (iOS Depth)

### Shadow Scale

| Class | Effect | Use Case |
|-------|--------|----------|
| `shadow-sm` | Minimal shadow | Subtle elevation |
| `shadow-md` | Medium shadow | Standard elevation |
| `shadow-lg` | Large shadow | Buttons, elevated elements |
| `shadow-xl` | Extra large shadow | Cards, containers |
| `shadow-2xl` | Maximum shadow | Hover states, emphasis |

### Shadow Patterns

**Card Shadow:**
```html
<div class="shadow-xl hover:shadow-2xl transition-shadow">
  <!-- Elevated card with hover effect -->
</div>
```

**Button Shadow:**
```html
<button class="shadow-lg shadow-blue-600/20">
  <!-- Colored glow effect -->
</button>
```

**Hover Elevation:**
```html
<div class="shadow-xl hover:shadow-2xl transition-shadow duration-200">
  <!-- Smooth shadow increase on hover -->
</div>
```

### Shadow with Color
```html
<!-- Blue glow on buttons -->
<button class="shadow-lg shadow-blue-600/20">
  Button
</button>

<!-- Colored shadow with opacity -->
<div class="shadow-2xl shadow-blue-600/30">
  Card
</div>
```

---

## 7. iOS-Like Design Principles

### Frosted Glass Effects
```html
<div class="backdrop-blur-md bg-white/80">
  <!-- Frosted glass navigation, modals -->
</div>
```

### Smooth Transitions
```html
<!-- Standard transition -->
<div class="transition-all duration-300">
  <!-- Smooth property changes -->
</div>

<!-- Specific property transitions -->
<div class="transition-shadow duration-200">
  <!-- Shadow only -->
</div>

<div class="transition-transform duration-500">
  <!-- Transform only -->
</div>
```

### Subtle Animations

**Scale on Hover:**
```html
<img class="hover:scale-105 transition-transform duration-500" />
<!-- 5% growth on hover -->
```

**Lift on Hover:**
```html
<div class="hover:-translate-y-1 transition-transform">
  <!-- 1px upward movement -->
</div>
```

**Combined Hover Effects:**
```html
<div class="hover:scale-105 hover:shadow-2xl transition-all duration-300">
  <!-- Scale + shadow increase -->
</div>
```

### Clean Borders
```html
<!-- Standard border -->
<div class="border border-gray-200">
  <!-- 1px light border -->
</div>

<!-- Dark border -->
<div class="border border-gray-800">
  <!-- 1px dark border -->
</div>

<!-- Colored border -->
<div class="border border-blue-600">
  <!-- Brand color border -->
</div>
```

### Whitespace Philosophy
- **Generous padding:** Always use at least `p-6` (24px) on containers
- **Breathing room:** `gap-8` (32px) minimum between cards
- **Section spacing:** `py-24` (96px) between major sections
- **Content margins:** `mb-6` to `mb-10` for element separation

### Color Overlays
```html
<!-- Semi-transparent backgrounds -->
<div class="bg-black/50">
  <!-- 50% opacity black -->
</div>

<div class="bg-white/80">
  <!-- 80% opacity white -->
</div>

<div class="bg-blue-600/20">
  <!-- 20% opacity blue -->
</div>
```

### Elevated Surfaces
- **Multi-level hierarchy:** Use different shadow levels to show depth
- **Hover elevation:** Increase shadow on interactive elements
- **Layered design:** Background → Card → Hover state

---

## 8. Color System

### Primary Colors

| Color | Hex | RGB | Use Case |
|-------|-----|-----|----------|
| **Brand Blue** | `#2563eb` | rgb(37,99,235) | Primary buttons, links, accents |
| **Hover Blue** | `#1d4ed8` | rgb(29,78,216) | Button hover states |
| **Black** | `#000000` | rgb(0,0,0) | Backgrounds, primary text |
| **White** | `#ffffff` | rgb(255,255,255) | Cards, text on dark |

### Gray Scale

| Class | Hex | Use Case |
|-------|-----|----------|
| `gray-50` | #f9fafb | Light backgrounds |
| `gray-100` | #f3f4f6 | Very light backgrounds |
| `gray-200` | #e5e7eb | Borders, dividers |
| `gray-300` | #d1d5db | Light borders |
| `gray-400` | #9ca3af | Subtle text, icons |
| `gray-500` | #6b7280 | Secondary text |
| `gray-600` | #4b5563 | Body text (secondary) |
| `gray-800` | #1f2937 | Dark borders, dark text |
| `gray-900` | #111827 | Dark backgrounds |

### Color Usage Patterns

**Text Colors:**
```html
<!-- Primary text -->
<p class="text-gray-900">Main content</p>

<!-- Secondary text -->
<p class="text-gray-600">Supporting content</p>

<!-- Subtle text -->
<p class="text-gray-400">Captions, hints</p>

<!-- White text on dark -->
<p class="text-white">Text on black/dark backgrounds</p>
```

**Background Colors:**
```html
<!-- Light section -->
<section class="bg-gray-50">

<!-- White card -->
<div class="bg-white">

<!-- Dark section -->
<section class="bg-black">

<!-- Dark card -->
<div class="bg-gray-900">
```

**Border Colors:**
```html
<!-- Light border -->
<div class="border border-gray-200">

<!-- Dark border -->
<div class="border border-gray-800">

<!-- Brand border -->
<div class="border border-blue-600">
```

### Color Rules
- ✅ **DO:** Use brand blue (#2563eb) for all primary actions
- ✅ **DO:** Use hover blue (#1d4ed8) for interactive states
- ❌ **DON'T:** Use gold, green, or cyan as primary colors
- ❌ **DON'T:** Use wrong blue (#0071e3) - always use brand blue

---

## 9. Component Patterns

### Card Pattern (Standard)
```html
<div class="bg-white p-10 rounded-3xl shadow-xl flex flex-col h-full hover:shadow-2xl transition-shadow duration-200">
  <h3 class="text-2xl font-black uppercase mb-4 text-gray-900">CARD TITLE</h3>
  <p class="text-gray-500 text-sm mb-6 leading-relaxed">Card description text.</p>
  <ul class="space-y-3 text-sm text-gray-800 font-medium mb-10 flex-1">
    <li class="flex items-center">
      <span class="w-1.5 h-1.5 bg-black rounded-full mr-2"></span>
      List item
    </li>
  </ul>
  <button class="w-full py-4 bg-blue-600 text-white font-bold rounded-full uppercase">
    ACTION
  </button>
</div>
```

### Card Pattern (Dark)
```html
<div class="bg-black border border-gray-800 rounded-lg overflow-hidden group hover:border-blue-600 transition duration-300">
  <div class="h-64 overflow-hidden">
    <img src="image.jpg" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
  </div>
  <div class="p-8 text-left">
    <h3 class="text-xl font-black text-white uppercase mb-4">CARD TITLE</h3>
    <p class="text-gray-400 text-sm leading-relaxed">Card description.</p>
  </div>
</div>
```

### Button Pattern (Primary)
```html
<button class="px-8 py-4 bg-blue-600 text-white font-bold rounded-full uppercase tracking-wider hover:bg-blue-700 transition shadow-lg shadow-blue-600/20">
  BUTTON TEXT
</button>
```

### Button Pattern (Secondary)
```html
<button class="px-8 py-4 bg-white text-black font-bold rounded-full uppercase border-2 border-gray-200 hover:border-gray-300 transition">
  SECONDARY BUTTON
</button>
```

### Button Pattern (Full Width)
```html
<button class="w-full py-4 bg-blue-600 text-white font-bold rounded-full uppercase tracking-wider hover:bg-blue-700 transition shadow-lg">
  FULL WIDTH BUTTON
</button>
```

### Section Pattern (Standard)
```html
<section class="py-24 bg-gray-50">
  <div class="max-w-7xl mx-auto px-6">
    <div class="text-center mb-20">
      <h2 class="text-4xl md:text-5xl font-black uppercase tracking-tight text-gray-900">
        SECTION TITLE
      </h2>
      <p class="text-gray-400 text-lg mt-6 max-w-2xl mx-auto">
        Section description text.
      </p>
    </div>
    <!-- Content -->
  </div>
</section>
```

### Section Pattern (Dark)
```html
<section class="bg-black py-24 px-6 text-center">
  <div class="max-w-7xl mx-auto">
    <h2 class="text-4xl md:text-5xl font-black text-white uppercase mb-6">
      SECTION <span class="text-blue-600">TITLE</span>
    </h2>
    <p class="text-gray-400 max-w-2xl mx-auto text-lg mb-16 leading-relaxed">
      Section description.
    </p>
    <!-- Content -->
  </div>
</section>
```

### List Pattern (Bullet Points)
```html
<ul class="space-y-3 text-sm text-gray-800 font-medium">
  <li class="flex items-center">
    <span class="w-1.5 h-1.5 bg-black rounded-full mr-2"></span>
    List item text
  </li>
  <li class="flex items-center">
    <span class="w-1.5 h-1.5 bg-black rounded-full mr-2"></span>
    Another list item
  </li>
</ul>
```

### Grid Pattern (3 Columns)
```html
<div class="grid md:grid-cols-3 gap-8">
  <div class="card">Card 1</div>
  <div class="card">Card 2</div>
  <div class="card">Card 3</div>
</div>
```

---

## 10. Responsive Breakpoints

### Tailwind Breakpoints

| Prefix | Min Width | Device |
|--------|-----------|--------|
| (none) | 0px | Mobile (default) |
| `sm:` | 640px | Small tablets |
| `md:` | 768px | Tablets |
| `lg:` | 1024px | Desktop |
| `xl:` | 1280px | Large desktop |
| `2xl:` | 1536px | Extra large |

### Common Responsive Patterns

**Typography:**
```html
<h1 class="text-4xl md:text-6xl lg:text-8xl">
  Responsive heading
</h1>
```

**Grid:**
```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
  <!-- Responsive grid -->
</div>
```

**Spacing:**
```html
<section class="py-12 md:py-24">
  <!-- Smaller padding on mobile -->
</section>
```

**Visibility:**
```html
<!-- Hide on mobile, show on desktop -->
<div class="hidden md:block">Desktop only</div>

<!-- Show on mobile, hide on desktop -->
<div class="block md:hidden">Mobile only</div>
```

---

## 11. Animation Standards

### Transition Duration

| Class | Duration | Use Case |
|-------|----------|----------|
| `duration-75` | 75ms | Instant feedback |
| `duration-150` | 150ms | Quick interactions |
| `duration-200` | 200ms | Standard hover (cards) |
| `duration-300` | 300ms | Standard transitions |
| `duration-500` | 500ms | Slow, deliberate animations |
| `duration-700` | 700ms | Image transitions |

### Transition Properties

| Class | Property | Use Case |
|-------|----------|----------|
| `transition-all` | All properties | General transitions |
| `transition-shadow` | Shadow only | Card hover effects |
| `transition-transform` | Transform only | Scale, translate |
| `transition-colors` | Colors only | Button hover |

### Hover Animations

**Scale:**
```html
<div class="hover:scale-105 transition-transform duration-500">
  <!-- 5% growth -->
</div>
```

**Translate:**
```html
<div class="hover:-translate-y-1 transition-transform">
  <!-- 1px upward lift -->
</div>
```

**Shadow:**
```html
<div class="shadow-xl hover:shadow-2xl transition-shadow duration-200">
  <!-- Shadow increase -->
</div>
```

**Combined:**
```html
<div class="hover:scale-105 hover:shadow-2xl transition-all duration-300">
  <!-- Multiple effects -->
</div>
```

### Easing
- Tailwind defaults use `ease` (cubic-bezier)
- For custom easing, use CSS: `transition-timing-function: ease-in-out`

---

## 12. Complete Example

### Full Card Component
```html
<section class="py-24 bg-gray-50">
  <div class="max-w-7xl mx-auto px-6">
    <div class="text-center mb-20">
      <h2 class="text-4xl md:text-5xl font-black uppercase tracking-tight text-gray-900">
        PROGRAMS
      </h2>
      <p class="text-gray-400 text-lg mt-6 max-w-2xl mx-auto leading-relaxed">
        Choose your training path.
      </p>
    </div>

    <div class="grid md:grid-cols-3 gap-8">
      <div class="bg-white p-10 rounded-3xl shadow-xl flex flex-col h-full hover:shadow-2xl transition-shadow duration-200">
        <h3 class="text-2xl font-black uppercase mb-4 text-gray-900">
          PROGRAM NAME
        </h3>
        <p class="text-gray-500 text-sm mb-6 leading-relaxed">
          Program description text goes here.
        </p>
        <ul class="space-y-3 text-sm text-gray-800 font-medium mb-10 flex-1">
          <li class="flex items-center">
            <span class="w-1.5 h-1.5 bg-black rounded-full mr-2"></span>
            Feature one
          </li>
          <li class="flex items-center">
            <span class="w-1.5 h-1.5 bg-black rounded-full mr-2"></span>
            Feature two
          </li>
        </ul>
        <button class="w-full py-4 bg-blue-600 text-white font-bold rounded-full uppercase tracking-wider hover:bg-blue-700 transition shadow-lg shadow-blue-600/20">
          SELECT PROGRAM
        </button>
      </div>
    </div>
  </div>
</section>
```

---

## Quick Reference

### Spacing Cheat Sheet
- `gap-8` = 32px (most common)
- `p-10` = 40px (card padding)
- `py-24` = 96px (section spacing)
- `px-6` = 24px (section horizontal)

### Typography Cheat Sheet
- Hero: `text-6xl md:text-8xl font-black uppercase`
- Section: `text-4xl md:text-5xl font-black uppercase`
- Card: `text-2xl font-black uppercase`
- Body: `text-base leading-relaxed`

### Radius Cheat Sheet
- Buttons: `rounded-full` (always)
- Cards: `rounded-3xl` (24px)
- Images: `rounded-lg` (8px)

### Shadow Cheat Sheet
- Cards: `shadow-xl hover:shadow-2xl`
- Buttons: `shadow-lg shadow-blue-600/20`

---

**Last Updated:** January 2025  
**Maintained By:** Godspeed Basketball Design Team
