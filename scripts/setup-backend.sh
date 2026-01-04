#!/bin/bash

# =====================================================
# Godspeed Basketball - Backend Setup Script
# =====================================================
# This script helps you set up all backend components
# =====================================================

set -e  # Exit on error

echo "🚀 Godspeed Basketball - Backend Setup"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found${NC}"
    echo "Creating .env from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ Created .env file${NC}"
        echo ""
        echo -e "${YELLOW}📝 Please edit .env and add your Supabase credentials:${NC}"
        echo "   1. VITE_SUPABASE_URL"
        echo "   2. VITE_SUPABASE_ANON_KEY"
        echo ""
        read -p "Press Enter after you've added your credentials..."
    else
        echo -e "${RED}❌ .env.example not found${NC}"
        exit 1
    fi
fi

# Check if Supabase credentials are set
source .env 2>/dev/null || true

if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
    echo -e "${RED}❌ Supabase credentials not set in .env${NC}"
    echo "Please add:"
    echo "  VITE_SUPABASE_URL=https://your-project.supabase.co"
    echo "  VITE_SUPABASE_ANON_KEY=your-anon-key"
    exit 1
fi

echo -e "${GREEN}✅ Environment variables configured${NC}"
echo ""

# List migration files
echo "📋 Migration files to run:"
echo ""

MIGRATIONS=(
    "supabase/migrations/001_comms_center_schema.sql"
    "supabase/migrations/002_ecommerce_schema.sql"
    "supabase/migrations/003_store_schema.sql"
    "supabase/migrations/004_supplier_sync.sql"
    "supabase/migrations/005_emergency_product_seed.sql"
    "supabase/migrations/006_parent_portal_training.sql"
    "supabase/migrations/007_product_variants_rls_fix.sql"
    "supabase/migrations/008_seed_training_data.sql"
)

for i in "${!MIGRATIONS[@]}"; do
    file="${MIGRATIONS[$i]}"
    if [ -f "$file" ]; then
        echo "   $((i+1)). ✅ $file"
    else
        echo "   $((i+1)). ❌ $file (NOT FOUND)"
    fi
done

echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo ""
echo "1. Go to https://app.supabase.com"
echo "2. Select your project"
echo "3. Go to SQL Editor"
echo "4. Run each migration file in order (001-008)"
echo "5. Or use Supabase CLI if you have it installed"
echo ""
echo -e "${GREEN}✨ All code is ready! Just run the migrations in Supabase.${NC}"
echo ""

# Check if supabase CLI is available
if command -v supabase &> /dev/null; then
    echo -e "${GREEN}✅ Supabase CLI detected${NC}"
    echo ""
    read -p "Do you want to link this project to Supabase? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Running: supabase link"
        supabase link --project-ref $(echo $VITE_SUPABASE_URL | sed 's|https://||' | sed 's|\.supabase\.co||')
        echo ""
        read -p "Do you want to push migrations now? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Running: supabase db push"
            supabase db push
            echo -e "${GREEN}✅ Migrations pushed!${NC}"
        fi
    fi
else
    echo -e "${YELLOW}💡 Tip: Install Supabase CLI for easier migration management${NC}"
    echo "   npm install -g supabase"
fi

echo ""
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo "Next: Test your setup by:"
echo "  1. Opening parent-portal.html"
echo "  2. Testing login/registration"
echo "  3. Testing PDF generation"
echo "  4. Testing cart functionality"
