#!/bin/bash

# Deployment Script for Godspeed Basketball Site

echo "========================================"
echo "    GODSPEED DEPLOYMENT SYSTEM"
echo "========================================"

# Check for npx
if ! command -v npx &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    echo "Please install it by running: brew install node"
    echo "Or download from: https://nodejs.org/"
    exit 1
fi

echo "Starting deployment sequence..."

# 1. Login
echo "Step 1: Authenticating..."
npx firebase-tools login

# 2. Initialize if needed
if [ ! -f ".firebaserc" ]; then
    echo "Step 2: Linking Project..."
    echo "Please select the project to deploy to (or create a new one)."
    npx firebase-tools init hosting
fi

# 3. Deploy
echo "Step 3: Deploying to Production..."
npx firebase-tools deploy

echo "========================================"
echo "    DEPLOYMENT COMPLETE"
echo "========================================"
