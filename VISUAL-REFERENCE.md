# Godspeed Basketball - Visual Design Reference

## Quick Visual Guide to the Design System

🎨 Color Palette At-a-Glance

```plaintext
┌─────────────────────────────────────────────────────────┐
│                    PRIMARY PALETTE                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ███████████  BLACK                                     │
│  #000000      Primary brand, headers, text              │
│               Use: Navigation, titles, emphasis         │
│                                                         │
│  ███████████  GODSPEED BLUE                             │
│  #2563eb      Main brand color, CTAs, logo accent       │
│               RGB: rgb(37, 99, 235)                     │
│               Tailwind: blue-600                        │
│               Use: Buttons, "BASKETBALL" logo, links    │
│                                                         │
│  ███████████  INTERACTION BLUE                          │
│  #1d4ed8      Hover states, active elements             │
│               RGB: rgb(29, 78, 216)                     │
│               Tailwind: blue-700                        │
│               Use: Button hover, active states          │
│                                                         │
│  ███████████  ORANGE RED                                │
│  #FF4500      Alerts, urgency (limited use)             │
│               Use: Sparingly for high priority          │
│                                                         │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                    NEUTRAL PALETTE                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ███████████  WHITE                                     │
│  #FFFFFF      Clean, light text & backgrounds           │
│                                                         │
│  ███████████  DARK GRAY                                 │
│  #333333      Body text, readable on white              │
│                                                         │
│  ███████████  LIGHT GRAY                                │
│  #F5F5F5      Section backgrounds, subtle fill          │
│                                                         │
│  ███████████  DARKER GRAY                               │
│  #1A1A1A      Dark sections, dramatic contrast          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

-----
📏 Typography Scale Visual

```plaintext
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  HERO TITLE - 3.5rem (56px)                                  │
│  Bold, Uppercase, Letter-spacing: 2px                        │
│  Example: "BUILT DIFFERENT. TRAINED DIFFERENT."              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  SECTION TITLE - 2.5rem (40px)                               │
│  Bold, Uppercase, Letter-spacing: 3px                        │
│  Example: "WHAT WE STAND FOR"                                │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Subsection Title - 2rem (32px)                              │
│  Bold, Sentence case, Letter-spacing: 1px                    │
│  Example: "Movement Mastery"                                 │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Card Title - 1.5rem (24px)                                  │
│  Bold, Sentence case                                         │
│  Example: "Elite Guard Academy"                              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Body Large - 1.2rem (19px)                                  │
│  Normal weight, Line-height: 1.8                             │
│  Used for: Hero descriptions, important intro text           │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Body Text - 1rem (16px)                                     │
│  Normal weight, Line-height: 1.6                             │
│  Used for: Default paragraph text, descriptions              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Small Text - 0.9rem (14px)                                  │
│  Normal weight, Line-height: 1.5                             │
│  Used for: Labels, captions, metadata                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

-----
📐 Spacing System Visual

```plaintext
┌────────────────────────────────────────────────────────┐
│            8px BASE UNIT SCALE                         │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ▓  0.5rem (8px)  - XS - Tight spacing                 │
│                                                        │
│  ▓▓  1rem (16px)  - SM - Small gaps                    │
│                                                        │
│  ▓▓▓  1.5rem (24px)  - MD - Medium gaps                │
│                                                        │
│  ▓▓▓▓  2rem (32px)  - LG - Large gaps                  │
│                                                        │
│  ▓▓▓▓▓▓  3rem (48px)  - XL - Section spacing           │
│                                                        │
│  ▓▓▓▓▓▓▓▓  4rem (64px)  - 2XL - Major sections         │
│                                                        │
│  ▓▓▓▓▓▓▓▓▓▓  5rem (80px)  - 3XL - Page sections        │
│                                                        │
└────────────────────────────────────────────────────────┘
```

USAGE GUIDE:
─────────────
• Between sections: 5rem
• Inside sections: 3rem
• Between elements: 2rem
• Button padding: 1rem x 2rem
• Card internal: 2rem
• Grid gaps: 2rem

-----
🔘 Button Styles Visual

```plaintext
┌──────────────────────────────────────────────────────┐
│                PRIMARY BUTTON                        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ╔═══════════════════════════════╗                   │
│  ║   TRAIN WITH GODSPEED         ║  ← Blue bg        │
│  ║   (White text, bold, caps)    ║     #2563eb       │
│  ╚═══════════════════════════════╝     Border-radius │
│           ↑ Padding: 1rem 2rem                       │
│                                                      │
│  HOVER STATE:                                        │
│  • Darker blue (#1d4ed8)                             │
│  • Lift up 2px (translateY)                          │
│  • Box shadow appears                                │
│                                                      │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│               SECONDARY BUTTON                       │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌───────────────────────────────┐                   │
│  │                               │                   │
│  │    JOIN CLUB GODSPEED         │  ← Transparent    │
│  │    (Blue border, 2px)         │    Blue border    │
│  │                               │    #2563eb        │
│  └───────────────────────────────┘                   │
│                                                      │
│  HOVER STATE:                                        │
│  • Fill with blue (#2563eb)                          │
│  • Text becomes white                                │
│                                                      │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                   TEXT LINK                          │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Training                                            │
│  (inherits color, no decoration)                     │
│     ↓                                                │
│  HOVER                                               │
│  Training (turns blue #2563eb)                       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

-----
📦 Card Component Anatomy

```plaintext
┌────────────────────────────────────────────────────┐
│                                                    │ ↑
│  ┌──────────────────────────────────────────┐    │ 
│  │                                          │    │ 2rem
│  │         IMAGE (optional)                 │    │ padding
│  │         Border-radius: 10px              │    │ all
│  │                                          │    │ sides
│  └──────────────────────────────────────────┘    │ 
│                                                    │
│  Program Name                    ← h3, 1.5rem    │
│                                     bold          │
│  Description text goes here and   ← p, 1rem      │
│  explains the program in 2-3         line 1.6    │
│  sentences maximum.                               │
│                                                    │
│  ✓ Feature one                   ← ul list       │
│  ✓ Feature two                      with         │
│  ✓ Feature three                    checkmarks   │
│                                                    │
│  This is where players become    ← highlight     │
│  problem-solvers. (italic)          text         │
│                                                    │
│  ┌─────────────────────┐                         │
│  │  SELECT PROGRAM     │         ← button        │
│  └─────────────────────┘            centered     │
│                                                    │ ↓
└────────────────────────────────────────────────────┘
```

SPECIFICATIONS:
─────────────────
• Background: White (#FFFFFF)
• Padding: 2rem all sides
• Border-radius: 10px
• Box-shadow: 0 5px 20px rgba(0,0,0,0.1)
• Hover: Lift 5px + stronger shadow

-----
📱 Responsive Grid Patterns

```plaintext
DESKTOP (1024px+)
┌────────────────────────────────────────────────┐
│  ┌──────┐  ┌──────┐  ┌──────┐                │
│  │Card 1│  │Card 2│  │Card 3│  ← 3 columns   │
│  └──────┘  └──────┘  └──────┘                │
│                                                │
│  Gap: 2rem between cards                       │
└────────────────────────────────────────────────┘

TABLET (768px - 1023px)
┌────────────────────────────────────────────────┐
│  ┌────────────┐  ┌────────────┐                │
│  │   Card 1   │  │   Card 2   │  ← 2 columns   │
│  └────────────┘  └────────────┘                │
│                                                │
│  ┌────────────┐  ┌────────────┐                │
│  │   Card 3   │  │   Card 4   │                │
│  └────────────┘  └────────────┘                │
│                                                │
│  Gap: 1.5rem between cards                     │
└────────────────────────────────────────────────┘

MOBILE (< 768px)
┌────────────────────────────────────────────────┐
│  ┌──────────────────────────┐                  │
│  │          Card 1          │  ← 1 column      │
│  └──────────────────────────┘     (stacked)    │
│                                                │
│  ┌──────────────────────────┐                  │
│  │          Card 2          │                  │
│  └──────────────────────────┘                  │
│                                                │
│  ┌──────────────────────────┐                  │
│  │          Card 3          │                  │
│  └──────────────────────────┘                  │
│                                                │
│  Gap: 1rem between cards                       │
└────────────────────────────────────────────────┘
```

-----
🎯 Interactive States Visual

```plaintext
BUTTON STATES:
──────────────
DEFAULT:
╔════════════════╗
║    CLICK ME    ║  Blue background (#2563eb)
╚════════════════╝  White text

HOVER:
╔════════════════╗
║    CLICK ME    ║  Darker blue (#1d4ed8)
╚════════════════╝  Lifted up 2px
  ▓▓▓▓▓▓▓▓          Shadow appears

ACTIVE (Clicked):
╔════════════════╗
║    CLICK ME    ║  Back to normal position
╚════════════════╝  No lift

FOCUS (Keyboard):
╔════════════════╗
║    CLICK ME    ║  2px blue outline
╚════════════════╝  2px offset
┌──────────────┐

DISABLED:
╔════════════════╗
║    CLICK ME    ║  50% opacity
╚════════════════╝  Not clickable

CARD STATES:
────────────
DEFAULT:
┌─────────────┐
│             │
│    CARD     │  Normal shadow
│             │
└─────────────┘
    ▓▓▓

HOVER:
┌─────────────┐
│             │  Lifted 5px
│    CARD     │  Stronger shadow
│             │
└─────────────┘
  ▓▓▓▓▓▓▓

INPUT STATES:
─────────────
DEFAULT:
┌────────────────────────┐
│ Enter your name...     │  1px gray border
└────────────────────────┘

FOCUS:
┌────────────────────────┐
│ John Doe_              │  Blue border (#2563eb)
└────────────────────────┘  No outline

ERROR:
┌────────────────────────┐
│ [empty]                │  Red border
└────────────────────────┘  This field is required  ← Red error message
```

-----
🎨 Color Combinations Reference

```plaintext
APPROVED COMBINATIONS (High Contrast):
──────────────────────────────────────
✓ Black text on White background
  ████████████████  High readability
  21:1 contrast ratio (AAA)

✓ White text on Black background
  ████████████████  Dramatic impact
  21:1 contrast ratio (AAA)

✓ Godspeed Blue on White
  ████████████████  Primary CTA
  7.0:1 contrast ratio (AAA)

✓ White on Godspeed Blue
  ████████████████  Button text
  7.0:1 contrast ratio (AAA)

✓ Dark Gray on White
  ████████████████  Body text
  12.6:1 contrast ratio (AAA)

✓ White on Dark Gray
  ████████████████  Subtle sections
  10.4:1 contrast ratio (AAA)

AVOID THESE COMBINATIONS:
──────────────────────────
✗ Gold on White
  ████████████████  Low contrast
  1.5:1 - Fails WCAG

✗ Orange on Gold
  ████████████████  Poor readability
  2.1:1 - Fails WCAG

✗ Light Gray on White
  ████████████████  Invisible
  1.1:1 - Fails WCAG

✗ Gold on Light Gray
  ████████████████  Weak contrast
  3.2:1 - Below standard
```

-----
📐 Section Layout Patterns

```plaintext
HERO SECTION LAYOUT:
────────────────────
┌────────────────────────────────────────────────┐
│ ┌──────────────────┐      ┌─────────────────┐  │
│ │    HUGE TITLE    │      │                 │  │
│ │                  │      │                 │  │
│ │  Supporting text │      │   HERO IMAGE    │  │
│ │  explaining the  │      │                 │  │
│ │  value prop...   │      │                 │  │
│ │                  │      │                 │  │
│ │ [CTA 1] [CTA 2]  │      │                 │  │
│ └──────────────────┘      └─────────────────┘  │
│      50% width                 50% width       │
└────────────────────────────────────────────────┘
• Full-width gradient background (black to dark gray)
• White text
• Padding: 6rem top/bottom, 2rem sides
• Mobile: Stack vertically

STANDARD SECTION LAYOUT:
─────────────────────────
┌────────────────────────────────────────────────┐
│                 SECTION TITLE                  │
│        (centered, 2.5rem, uppercase)           │
│                                                │
│         Intro paragraph explaining             │
│       the section content. Max width           │
│          800px, centered. (1.2rem)             │
│                                                │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐     │
│  │Content 1│    │Content 2│    │Content 3│     │
│  │         │    │         │    │         │     │
│  └─────────┘    └─────────┘    └─────────┘     │
│                                                │
│               [Call to Action]                 │
└────────────────────────────────────────────────┘
• Max-width: 1200px container
• Padding: 5rem top/bottom
• Content grid: 2-3 columns
• Gap: 2rem

VALUE BLOCK LAYOUT (Alternating):
──────────────────────────────────
Pattern A (Image Left):
┌────────────────────────────────────────────────┐
│  ┌───────────┐    ┌──────────────────────────┐ │
│  │           │    │          Title           │ │
│  │           │    │     Tagline (italic)     │ │
│  │   IMAGE   │    │                          │ │
│  │           │    │  • Point 1   • Point 3   │ │
│  │           │    │  • Point 2   • Point 4   │ │
│  └───────────┘    │                          │ │
│                   │  Problem-Solution-Result │ │
│                   └──────────────────────────┘ │
└────────────────────────────────────────────────┘

Pattern B (Image Right) - REVERSE:
┌────────────────────────────────────────────────┐
│  ┌──────────────────────────┐    ┌───────────┐ │
│  │          Title           │    │           │ │
│  │     Tagline (italic)     │    │           │ │
│  │                          │    │   IMAGE   │ │
│  │  • Point 1   • Point 3   │    │           │ │
│  │  • Point 2   • Point 4   │    │           │ │
│  │                          │    │           │ │
│  │  Problem-Solution-Result │    └───────────┘ │
│  └──────────────────────────┘                  │
└────────────────────────────────────────────────┘
• Alternate left/right on each block
• White background card
• Padding: 3rem
• Gap between image and content: 3rem
```

-----
🎭 Animation Timing Reference

```plaintext
TRANSITION SPEEDS:
──────────────────
FAST (0.15s)    ▓▓░░░░░░░░░░░░░   Used for: Micro-interactions
                                  Example: Button press

NORMAL (0.3s)   ▓▓▓▓▓▓░░░░░░░░░   Used for: Most transitions
                                  Example: Hover effects, color changes

SLOW (0.6s)     ▓▓▓▓▓▓▓▓▓▓▓▓░░░   Used for: Page elements
                                  Example: Scroll animations, fade-ins

EASING FUNCTIONS:
─────────────────
EASE (Default)   ╱──────╲
                ╱        ╲       Smooth start and end
               ╱          ╲      Use for: Most animations

EASE-IN         ╱────            
               ╱                 Slow start, fast end
              ╱                  Use for: Elements leaving

EASE-OUT             ────╲
                          ╲      Fast start, slow end
                           ╲     Use for: Elements entering

ANIMATION PATTERNS:
───────────────────
FADE IN + SLIDE UP:
  ░░░░░  Opacity: 0 → 1
  ▓▓▓▓▓  ↑ TranslateY: 30px → 0
  Duration: 0.6s
  Trigger: Element in viewport - 100px

BUTTON HOVER:
  ▓▓▓▓▓  Background color change
  ▓▓▓▓▓  ↑ TranslateY: 0 → -2px
  Duration: 0.3s
  Box-shadow appears
```

-----
📏 Measurement Quick Reference

```plaintext
╔════════════════════════════════════════════════╗
║         QUICK MEASUREMENTS CHEAT SHEET         ║
╚════════════════════════════════════════════════╝
CONTAINER:
─────────
Max-width: 1200px
Padding: 0 20px (mobile grows to 40px desktop)

SECTIONS:
─────────
Padding vertical: 5rem (80px)
Padding horizontal: 2rem (32px)
Gap between sections: 5rem

TYPOGRAPHY:
───────────
Hero: 56px / 3.5rem
Section Title: 40px / 2.5rem
Card Title: 24px / 1.5rem
Body: 16px / 1rem
Line height: 1.6-1.8

SPACING:
────────
XS: 8px / 0.5rem
SM: 16px / 1rem
MD: 24px / 1.5rem
LG: 32px / 2rem
XL: 48px / 3rem
2XL: 64px / 4rem
3XL: 80px / 5rem

BUTTONS:
────────
Padding: 1rem 2rem (16px 32px)
Border-radius: 5px
Min-height: 44px (touch target)
Font-size: 1rem
Text-transform: uppercase

CARDS:
──────
Padding: 2rem (32px)
Border-radius: 10px
Shadow: 0 5px 20px rgba(0,0,0,0.1)
Gap in grid: 2rem

BORDERS:
────────
Standard: 1px
Emphasized: 2px
Border-radius small: 5px
Border-radius large: 10px

IMAGES:
───────
Border-radius: 10px
Max-width: 100%
Height: auto
Shadow on heros: 0 10px 40px rgba(0,0,0,0.5)
```

-----
✅ Component Checklist

```plaintext
BEFORE DEPLOYING A NEW COMPONENT:
──────────────────────────────────
□ Uses approved colors only
□ Follows spacing system (8px units)
□ Has hover state defined
□ Has focus state (for interactive elements)
□ Has disabled state (if applicable)
□ Tested on mobile
□ Tested on tablet
□ Tested on desktop
□ Meets contrast requirements (4.5:1)
□ Has proper semantic HTML
□ Includes alt text for images
□ Uses consistent border-radius
□ Follows typography scale
□ Animation timing specified
□ Documented in design system
□ Reviewed by team
```

-----
🎯 Common Mistakes to Avoid

```plaintext
❌ WRONG                     ✅ RIGHT
─────────────────────────────────────────────
Using random colors          Use defined palette
#8B4513                      #000000, #2563eb

Inconsistent spacing         8px spacing system
margin: 13px                 margin: 1rem (16px)

Missing hover states         Define all states
button { }                   button:hover { }

Low contrast                 4.5:1 minimum
Gray on light gray           Black on white

Generic button text          Action-oriented
"Click here"                 "Train with Godspeed"

Walls of text                Break into paragraphs
500 word paragraph           3-4 short paragraphs

Tiny touch targets           44x44px minimum
20px tall                    44px tall

Skipping alt text            Descriptive alt text

Mixing font sizes            Use type scale
Font-size: 17px              Font-size: 1rem (16px)

Creating new patterns        Use existing components
Custom card style            Standard program-card

No mobile testing            Test all breakpoints
Looks good on laptop         Tested on all devices

Vague content                Specific, clear content
"We're the best"             "Movement science based..."
```

-----
📱 Responsive Breakpoint Guide

```plaintext
┌────────────────────────────────────────────────┐
│  MOBILE FIRST APPROACH                         │
├────────────────────────────────────────────────┤
│                                                │
│  MOBILE (Default)                              │
│  320px - 767px                                 │
│  ┌──────┐                                      │
│  │      │  • Single column                     │
│  │      │  • Stack everything                  │
│  │      │  • Larger touch targets              │
│  └──────┘  • Simplified navigation             │
│             • 60% spacing scale                │
│                                                │
├────────────────────────────────────────────────┤
│                                                │
│  TABLET                                        │
│  768px - 1023px                                │
│  ┌─────┐ ┌─────┐                               │
│  │     │ │     │  • 2 columns                  │
│  │     │ │     │  • Some side-by-side          │
│  └─────┘ └─────┘  • Medium spacing             │
│                     • 80% spacing scale        │
│                                                │
├────────────────────────────────────────────────┤
│                                                │
│  DESKTOP                                       │
│  1024px+                                       │
│  ┌───┐ ┌───┐ ┌───┐                             │
│  │   │ │   │ │   │  • 3 columns                │
│  │   │ │   │ │   │  • Full layouts             │
│  └───┘ └───┘ └───┘  • 100% spacing             │
│                      • All features visible    │
│                                                │
└────────────────────────────────────────────────┘
```

MEDIA QUERY STRUCTURE:
──────────────────────
/*Mobile: 320px+ (Default)*/
.element {
    font-size: 2rem;
    grid-template-columns: 1fr;
}

/*Tablet: 768px+*/
@media (min-width: 768px) {
    .element {
        font-size: 2.2rem;
        grid-template-columns: repeat(2, 1fr);
    }
}

/*Desktop: 1024px+*/
@media (min-width: 1024px) {
    .element {
        font-size: 2.5rem;
        grid-template-columns: repeat(3, 1fr);
    }
}

-----
🚀 Performance Guidelines

```plaintext
OPTIMIZATION CHECKLIST:
───────────────────────
IMAGES:
□ Compressed (TinyPNG, ImageOptim)
□ Correct format (JPG for photos, PNG for graphics)
□ Sized appropriately (no 4000px images for 400px display)
□ Lazy loading on non-critical images
□ Alt text included

CSS:
□ Minimize use of expensive properties (box-shadow, blur)
□ Use transforms instead of position for animations
□ Combine similar styles
□ Remove unused CSS
□ Minify for production

JAVASCRIPT:
□ Defer non-critical scripts
□ Debounce scroll events
□ Minimize DOM manipulation
□ Remove console.logs
□ Minify for production

FONTS:
□ Limit font weights loaded
□ Use system fonts when possible
□ Preload critical fonts
□ Font-display: swap

GENERAL:
□ Enable browser caching
□ Compress with GZIP
□ Minimize HTTP requests
□ Test on slow connections
```

-----
📖 Usage Scenarios

```plaintext
SCENARIO: Adding a New Section
───────────────────────────────
1. Choose appropriate layout:
   Hero? Use hero pattern
   Content? Use section pattern
   Features? Use grid pattern

2. Apply spacing:
   Section padding: 5rem
   Internal gaps: 2rem
   Between elements: 1-1.5rem

3. Style text:
   Title: section-title class (2.5rem)
   Intro: section-intro class (1.2rem)
   Body: default (1rem)

4. Add components:
   Use existing card components
   Apply standard button styles
   Follow grid patterns

5. Test responsiveness:
   Desktop: full layout
   Tablet: 2 columns
   Mobile: stack

6. Verify accessibility:
   Color contrast ✓
   Focus indicators ✓
   Semantic HTML ✓


SCENARIO: Creating a Button
────────────────────────────
1. Primary action: [Action Text]
2. Secondary action: [Action Text]

✓ Use action verbs
✓ Keep text short (1-3 words)
✓ Use proper HTML (button for forms, a for links)
✓ Include focus/hover states


SCENARIO: Choosing Colors
──────────────────────────
Q: What color for a button?
A: Primary CTA = Godspeed Blue (#2563eb)
   Secondary = Blue border, transparent bg

Q: What color for text?
A: On white = Dark gray (#333333)
   On black = White (#FFFFFF)

Q: What color for backgrounds?
A: Main sections = Light gray (#F5F5F5)
   Emphasis = Dark gradient
   Cards = White (#FFFFFF)

Q: What if I need a new color?
A: Don't. Use existing palette. If absolutely necessary, get approval first.
```

-----
END OF VISUAL REFERENCE
Keep this document handy for quick lookups!
For detailed explanations, see: DESIGN-SYSTEM.md
