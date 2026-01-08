#!/bin/bash

# Security Migrations Runner using Supabase CLI
# 
# This script helps you run the security migrations (009, 010, 011)
# using the Supabase CLI.

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}=== Security Migrations Runner (Supabase CLI) ===${NC}\n"

# Check if Supabase CLI is available
if ! command -v npx &> /dev/null; then
    echo -e "${RED}❌ Error: npx not found${NC}"
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo -e "${YELLOW}Please create .env file with VITE_SUPABASE_URL${NC}"
    exit 1
fi

# Load .env
export $(grep -v '^#' .env | xargs)

# Check for Supabase URL
if [ -z "$VITE_SUPABASE_URL" ]; then
    echo -e "${RED}❌ Error: VITE_SUPABASE_URL not found in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found Supabase URL: $VITE_SUPABASE_URL${NC}\n"

# Extract project ref from URL
PROJECT_REF=$(echo $VITE_SUPABASE_URL | sed 's|https://||' | sed 's|\.supabase\.co||')
echo -e "${CYAN}Project Ref: $PROJECT_REF${NC}\n"

# Check if project is linked
echo -e "${YELLOW}Checking if project is linked...${NC}"
if [ ! -f supabase/.temp/project-ref ]; then
    echo -e "${YELLOW}Project not linked. Linking now...${NC}"
    echo -e "${BLUE}Running: npx supabase link --project-ref $PROJECT_REF${NC}\n"
    
    # Note: This will prompt for database password
    npx supabase link --project-ref $PROJECT_REF || {
        echo -e "${RED}❌ Failed to link project${NC}"
        echo -e "${YELLOW}You may need to run this manually:${NC}"
        echo -e "${CYAN}  npx supabase link --project-ref $PROJECT_REF${NC}"
        exit 1
    }
else
    echo -e "${GREEN}✅ Project already linked${NC}\n"
fi

# Migration files
MIGRATIONS=(
    "supabase/migrations/009_email_verification.sql"
    "supabase/migrations/010_mfa_system.sql"
    "supabase/migrations/011_unified_auth_roles.sql"
)

echo -e "${CYAN}Running migrations...${NC}\n"

# Run each migration
for i in "${!MIGRATIONS[@]}"; do
    migration="${MIGRATIONS[$i]}"
    echo -e "${BLUE}[$((i+1))/${#MIGRATIONS[@]}] Running: $migration${NC}"
    
    if [ ! -f "$migration" ]; then
        echo -e "${RED}❌ File not found: $migration${NC}"
        exit 1
    fi
    
    # Execute migration
    npx supabase db execute -f "$migration" || {
        echo -e "${RED}❌ Migration failed: $migration${NC}"
        exit 1
    }
    
    echo -e "${GREEN}✅ Migration completed: $migration${NC}\n"
done

echo -e "${GREEN}🎉 All migrations completed successfully!${NC}\n"
echo -e "${CYAN}Next steps:${NC}"
echo -e "  1. Verify tables in Supabase Table Editor"
echo -e "  2. Test features using docs/SECURITY_SETUP_CHECKLIST.md"
