#!/bin/bash
# Stop Auto-Commit Watcher

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/auto-commit.pid"

# Check if PID file exists
if [ ! -f "$PID_FILE" ]; then
    echo "Auto-commit watcher is not running (no PID file found)"
    exit 0
fi

PID=$(cat "$PID_FILE")

# Check if process is running
if ps -p "$PID" > /dev/null 2>&1; then
    echo "Stopping auto-commit watcher (PID: $PID)..."
    kill "$PID"
    
    # Wait for process to stop
    for i in {1..10}; do
        if ! ps -p "$PID" > /dev/null 2>&1; then
            break
        fi
        sleep 0.5
    done
    
    # Force kill if still running
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Force killing process..."
        kill -9 "$PID" 2>/dev/null
    fi
    
    # Remove PID file
    rm -f "$PID_FILE"
    echo "✓ Auto-commit watcher stopped"
else
    echo "Auto-commit watcher is not running (stale PID file)"
    rm -f "$PID_FILE"
fi
