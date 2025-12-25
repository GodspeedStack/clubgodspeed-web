#!/bin/bash

# =====================================================
# GODSPEED COMMS CENTER - SETUP SCRIPT
# =====================================================
# This script installs all required dependencies for
# the Godspeed Comms Center messaging system
# =====================================================

echo "========================================="
echo "  GODSPEED COMMS CENTER SETUP"
echo "========================================="
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed."
    echo "Please install Node.js from: https://nodejs.org/"
    exit 1
fi

echo "✓ npm found"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
echo ""

# Core dependencies
echo "Installing @supabase/supabase-js..."
npm install @supabase/supabase-js

echo "Installing resend..."
npm install resend

echo ""
echo "========================================="
echo "  ✅ INSTALLATION COMPLETE"
echo "========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Set up Supabase:"
echo "   - Create account at https://app.supabase.com"
echo "   - Create a new project"
echo "   - Run the SQL migration from supabase/migrations/001_comms_center_schema.sql"
echo ""
echo "2. Set up Resend:"
echo "   - Create account at https://resend.com"
echo "   - Verify your sending domain"
echo "   - Get your API key"
echo ""
echo "3. Configure environment variables:"
echo "   - Copy .env.example to .env"
echo "   - Fill in your Supabase URL and anon key"
echo "   - Fill in your Resend API key"
echo ""
echo "4. Read the documentation:"
echo "   - docs/COMMS_CENTER_README.md"
echo "   - docs/ENVIRONMENT_VARIABLES.md"
echo ""
echo "========================================="
