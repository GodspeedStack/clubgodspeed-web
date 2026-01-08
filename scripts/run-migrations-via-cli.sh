#!/bin/bash

# Run Security Migrations via Supabase CLI
# 
# This script attempts to run migrations using Supabase CLI.
# If CLI is not installed, it provides installation instructions.
#
# Usage:
#   ./scripts/run-migrations-via-cli.sh

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${CYAN}=== Security Migrations Runner (Supabase CLI) ===${NC}\n"

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${YELLOW}⚠️  Supabase CLI not found.${NC}"
    echo -e "${CYAN}Installing Supabase CLI...${NC}\n"
    
    # Try to install via npm (local)
    if command -v npm &> /dev/null; then
        echo "Attempting to install Supabase CLI locally..."
        npm install supabase --save-dev 2>&1 | head -20 || {
            echo -e "${YELLOW}Local install failed. Trying global install (may require sudo)...${NC}"
            echo -e "${CYAN}Please run: npm install -g supabase${NC}"
            echo -e "${CYAN}Or install via Homebrew: brew install supabase/tap/supabase${NC}"
            exit 1
        }
        
        # Use npx to run supabase
        SUPABASE_CMD="npx supabase"
    else
        echo -e "${RED}❌ npm not found. Please install Node.js first.${NC}"
        exit 1
    fi
else
    SUPABASE_CMD="supabase"
    echo -e "${GREEN}✅ Supabase CLI found${NC}\n"
fi

# Check for .env file
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    echo -e "${YELLOW}Please create .env file with VITE_SUPABASE_URL${NC}"
    exit 1
fi

# Load environment variables
source .env 2>/dev/null || {
    echo -e "${YELLOW}⚠️  Could not source .env file. Make sure VITE_SUPABASE_URL is set.${NC}"
}

# Check for Supabase URL
if [ -z "$VITE_SUPABASE_URL" ]; then
    echo -e "${RED}❌ VITE_SUPABASE_URL not found in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found Supabase URL: ${VITE_SUPABASE_URL}${NC}\n"

# Extract project ref from URL
PROJECT_REF=$(echo $VITE_SUPABASE_URL | sed 's|https://||' | sed 's|\.supabase\.co||')

echo -e "${CYAN}📋 Migration files to run:${NC}\n"
echo -e "   1. ${GREEN}009_email_verification.sql${NC} - Email Verification System"
echo -e "   2. ${GREEN}010_mfa_system.sql${NC} - MFA/2FA System"
echo -e "   3. ${GREEN}011_unified_auth_roles.sql${NC} - Unified Auth & Roles\n"

# Check if project is linked
if [ ! -f .supabase/config.toml ]; then
    echo -e "${YELLOW}⚠️  Project not linked to Supabase${NC}"
    echo -e "${CYAN}Linking project...${NC}\n"
    
    if [ -n "$PROJECT_REF" ]; then
        $SUPABASE_CMD link --project-ref "$PROJECT_REF" || {
            echo -e "${YELLOW}⚠️  Auto-link failed. Please link manually:${NC}"
            echo -e "${MAGENTA}   $SUPABASE_CMD link --project-ref $PROJECT_REF${NC}"
            echo -e "${YELLOW}   Or: $SUPABASE_CMD link${NC}"
            exit 1
        }
    else
        echo -e "${YELLOW}⚠️  Could not extract project ref. Please link manually:${NC}"
        echo -e "${MAGENTA}   $SUPABASE_CMD link${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Project linked${NC}\n"

# Run migrations
echo -e "${CYAN}🚀 Running migrations...${NC}\n"

# Option 1: Push all migrations at once
echo -e "${CYAN}Attempting to push all migrations...${NC}"
$SUPABASE_CMD db push || {
    echo -e "${YELLOW}⚠️  db push failed. Trying individual migrations...${NC}\n"
    
    # Option 2: Run migrations individually
    MIGRATIONS=(
        "supabase/migrations/009_email_verification.sql"
        "supabase/migrations/010_mfa_system.sql"
        "supabase/migrations/011_unified_auth_roles.sql"
    )
    
    for i in "${!MIGRATIONS[@]}"; do
        migration="${MIGRATIONS[$i]}"
        echo -e "${CYAN}[$((i+1))/3] Running ${migration}...${NC}"
        
        if [ -f "$migration" ]; then
            $SUPABASE_CMD db execute -f "$migration" || {
                echo -e "${RED}❌ Migration ${migration} failed${NC}"
                exit 1
            }
            echo -e "${GREEN}✅ ${migration} completed${NC}\n"
        else
            echo -e "${RED}❌ Migration file not found: ${migration}${NC}"
            exit 1
        fi
    done
}

echo -e "${GREEN}✅ All migrations completed successfully!${NC}\n"
echo -e "${CYAN}📝 Next steps:${NC}"
echo -e "   1. Verify tables in Supabase Dashboard → Table Editor"
echo -e "   2. Test features using docs/SECURITY_SETUP_CHECKLIST.md\n"
