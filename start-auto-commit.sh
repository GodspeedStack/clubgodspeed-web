#!/bin/bash
# Start Auto-Commit Watcher

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/auto-commit.pid"
LOG_FILE="$SCRIPT_DIR/auto-commit.log"

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Auto-commit is already running (PID: $PID)"
        echo "To stop it, run: ./stop-auto-commit.sh"
        exit 1
    else
        # Stale PID file
        rm -f "$PID_FILE"
    fi
fi

# Change to script directory
cd "$SCRIPT_DIR" || exit 1

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the watcher in background
echo "Starting auto-commit watcher..."
echo "Logs will be written to: $LOG_FILE"
echo "PID file: $PID_FILE"
echo ""
echo "To stop the watcher, run: ./stop-auto-commit.sh"
echo "Or use: npm run auto-commit:stop"
echo ""

# Start in background and redirect output
nohup node auto-commit.js > /dev/null 2>&1 &

# Wait a moment to check if it started
sleep 1

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "✓ Auto-commit watcher started successfully (PID: $PID)"
        echo "  Watching for file changes..."
        echo "  Changes will be committed and pushed after 5 seconds of inactivity"
    else
        echo "✗ Failed to start auto-commit watcher"
        echo "  Check $LOG_FILE for error details"
        exit 1
    fi
else
    echo "✗ Failed to start auto-commit watcher"
    echo "  Check $LOG_FILE for error details"
    exit 1
fi
