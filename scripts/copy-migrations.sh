#!/bin/bash
# Copy migrations SQL to clipboard
# Usage: ./scripts/copy-migrations.sh

cd "$(dirname "$0")/.." || exit 1

if [ -f "supabase/migrations/combined_security_migrations.sql" ]; then
    cat supabase/migrations/combined_security_migrations.sql | pbcopy
    echo "✅ SQL copied to clipboard!"
    echo "Paste it into Supabase SQL Editor now."
else
    echo "❌ Migration file not found"
    exit 1
fi
