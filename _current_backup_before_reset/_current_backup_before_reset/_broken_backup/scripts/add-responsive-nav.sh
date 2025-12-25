#!/bin/bash

# =====================================================
# ADD RESPONSIVE NAV TO ALL HTML FILES
# =====================================================

echo "Adding responsive navigation to all HTML files..."

# List of HTML files to update
files=(
    "aau.html"
    "about.html"
    "academy.html"
    "calendar-preview.html"
    "product.html"
    "shop.html"
    "training.html"
    "parent-portal.html"
    "coach-portal.html"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "Updating $file..."
        
        # Add responsive-nav.css after style.css if not already present
        if ! grep -q "responsive-nav.css" "$file"; then
            sed -i.bak 's|<link rel="stylesheet" href="style.css">|<link rel="stylesheet" href="style.css">\n    <link rel="stylesheet" href="responsive-nav.css">|' "$file"
        fi
        
        # Add MobileBottomNav.js before </body> if not already present
        if ! grep -q "MobileBottomNav.js" "$file"; then
            sed -i.bak 's|</body>|    <script src="src/components/MobileBottomNav.js"></script>\n</body>|' "$file"
        fi
        
        echo "✓ $file updated"
    else
        echo "⚠ $file not found, skipping..."
    fi
done

# Clean up backup files
rm -f *.bak

echo ""
echo "✅ All HTML files updated with responsive navigation!"
echo ""
echo "Changes made:"
echo "1. Added responsive-nav.css stylesheet"
echo "2. Added MobileBottomNav.js script"
echo ""
echo "Test by opening any page and resizing your browser window."
