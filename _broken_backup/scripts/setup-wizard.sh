#!/bin/bash

# =====================================================
# GODSPEED COMMS CENTER - INTERACTIVE SETUP WIZARD
# =====================================================

echo "========================================="
echo "  GODSPEED COMMS CENTER SETUP WIZARD"
echo "========================================="
echo ""
echo "This wizard will help you configure your environment variables."
echo ""

# Check if .env already exists
if [ -f ".env" ]; then
    echo "⚠️  Warning: .env file already exists."
    read -p "Do you want to overwrite it? (y/n): " overwrite
    if [ "$overwrite" != "y" ]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

echo ""
echo "📝 Please provide the following information:"
echo ""

# Supabase URL
echo "1. SUPABASE PROJECT URL"
echo "   Get from: https://app.supabase.com → Your Project → Settings → API"
echo "   Format: https://your-project-id.supabase.co"
read -p "   Enter Supabase URL: " SUPABASE_URL

# Supabase Anon Key
echo ""
echo "2. SUPABASE ANON KEY"
echo "   Get from: https://app.supabase.com → Your Project → Settings → API"
echo "   Look for: 'anon public' key"
read -p "   Enter Supabase Anon Key: " SUPABASE_ANON_KEY

# Resend API Key
echo ""
echo "3. RESEND API KEY"
echo "   Get from: https://resend.com → API Keys"
echo "   Format: re_xxxxxxxxxxxxxxxxxxxxxxxx"
read -p "   Enter Resend API Key: " RESEND_API_KEY

# Create .env file
echo ""
echo "Creating .env file..."

cat > .env << EOF
# =====================================================
# GODSPEED COMMS CENTER - ENVIRONMENT VARIABLES
# =====================================================
# Generated: $(date)
# =====================================================

# Supabase Configuration
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY

# Resend Email Configuration
VITE_RESEND_API_KEY=$RESEND_API_KEY
EOF

echo ""
echo "✅ .env file created successfully!"
echo ""
echo "========================================="
echo "  NEXT STEPS"
echo "========================================="
echo ""
echo "1. Set up Supabase Database:"
echo "   - Go to: https://app.supabase.com"
echo "   - Open SQL Editor"
echo "   - Copy contents of: supabase/migrations/001_comms_center_schema.sql"
echo "   - Execute the SQL"
echo ""
echo "2. Verify Resend Domain:"
echo "   - Go to: https://resend.com/domains"
echo "   - Add your domain"
echo "   - Add DNS records"
echo "   - Verify domain"
echo ""
echo "3. Test the setup:"
echo "   - Run: npm run dev"
echo "   - Check browser console for connection errors"
echo ""
echo "========================================="
