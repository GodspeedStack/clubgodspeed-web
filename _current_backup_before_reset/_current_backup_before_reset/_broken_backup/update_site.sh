#!/bin/bash
# Script to easily update the website on GitHub

echo "==================================="
echo "   UPDATING GODSPEED WEBSITE"
echo "==================================="

# 1. Add all changes
git add .

# 2. Commit changes (with timestamp)
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
git commit -m "Site update: $TIMESTAMP"

# 3. Push to GitHub
echo "Pushing to GitHub..."
git push origin main

echo "==================================="
echo "   UPDATE COMPLETE"
echo "==================================="
