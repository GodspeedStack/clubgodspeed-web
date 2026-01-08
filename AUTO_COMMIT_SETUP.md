# Auto-Commit Setup Guide

This guide will help you set up automatic git commits and pushes whenever you save files, so you never have to manually use the terminal again.

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set Up Authentication** (Choose one method below)

3. **Start the Watcher**
   ```bash
   ./start-auto-commit.sh
   # OR
   npm run auto-commit:start
   ```

4. **That's it!** Now whenever you save a file, it will automatically be committed and pushed after 5 seconds.

## Authentication Setup

You need to configure git authentication so the script can push to GitHub. Choose one method:

### Option 1: SSH Keys (Recommended)

If you already have SSH keys set up for GitHub, you're done! The script will use them automatically.

**To check if SSH is working:**
```bash
ssh -T git@github.com
```

If you see "Hi [username]! You've successfully authenticated", you're good to go.

**If SSH isn't set up:**
1. Generate a new SSH key:
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```
2. Add it to your SSH agent:
   ```bash
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519
   ```
3. Add the public key to GitHub:
   - Copy your public key: `cat ~/.ssh/id_ed25519.pub`
   - Go to GitHub → Settings → SSH and GPG keys → New SSH key
   - Paste your key and save

### Option 2: HTTPS with Personal Access Token

1. **Create a GitHub Personal Access Token:**
   - Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Give it a name like "Auto-Commit"
   - Select scopes: `repo` (full control of private repositories)
   - Click "Generate token"
   - **Copy the token immediately** (you won't see it again!)

2. **Configure Git to use HTTPS:**
   ```bash
   git remote set-url origin https://github.com/GodspeedStack/clubgodspeed-web.git
   ```

3. **Update auto-commit.config.js:**
   ```javascript
   useHTTPS: true,
   ```

4. **Store token in .env file:**
   Create a `.env` file in the project root:
   ```
   GITHUB_TOKEN=your_token_here
   ```

   The script will automatically use this token for authentication.

## Configuration

Edit `auto-commit.config.js` to customize behavior:

- **debounceDelay**: How long to wait after last file change before committing (default: 5000ms)
- **autoPush**: Automatically push after commit (default: true)
- **pullBeforePush**: Pull latest changes before pushing (recommended for shared repos)
- **branch**: Git branch to push to (default: 'main')
- **ignorePatterns**: Files/folders to ignore

## Usage

### Start the Watcher

```bash
./start-auto-commit.sh
# OR
npm run auto-commit:start
```

The watcher runs in the background and continues until you stop it.

### Stop the Watcher

```bash
./stop-auto-commit.sh
# OR
npm run auto-commit:stop
```

### Check Status

The watcher creates a PID file (`auto-commit.pid`) and log file (`auto-commit.log`).

**Check if running:**
```bash
cat auto-commit.pid
ps -p $(cat auto-commit.pid)
```

**View logs:**
```bash
tail -f auto-commit.log
```

## How It Works

1. **File Watching**: The script watches all files in your project (except ignored patterns)
2. **Debouncing**: When you save a file, it waits 5 seconds for more changes
3. **Auto-Stage**: All changes are automatically staged
4. **Smart Commits**: Commit messages are generated based on what files changed
5. **Auto-Push**: Changes are automatically pushed to GitHub

## Commit Messages

The script generates intelligent commit messages:
- `Auto-commit: Update javascript (3 files) - script.js, auth.js, security.js`
- `Auto-commit: Update html - index.html`
- `Auto-commit: Update css, assets (5 files)`

You can customize this in `auto-commit.config.js`.

## Troubleshooting

### "Permission denied (publickey)"
- Your SSH keys aren't set up correctly
- See "Option 1: SSH Keys" above

### "Authentication failed"
- If using HTTPS, check that `GITHUB_TOKEN` is set in `.env`
- If using SSH, verify your key is added to GitHub

### "Nothing to commit"
- This is normal if there are no actual changes
- The script checks git status before committing

### "Merge conflict detected"
- Someone else pushed changes to the remote
- You'll need to resolve manually:
  ```bash
  git pull origin main
  # Resolve conflicts
  git add .
  git commit -m "Resolve merge conflicts"
  git push origin main
  ```

### Watcher not starting
- Check `auto-commit.log` for errors
- Make sure dependencies are installed: `npm install`
- Verify Node.js is installed: `node --version`

### Too many commits
- Increase `debounceDelay` in `auto-commit.config.js`
- The default is 5 seconds - increase to 10-30 seconds if needed

## Safety Features

- **No Force Push**: The script never force pushes (safety)
- **Error Handling**: Network errors won't crash the watcher
- **Smart Ignoring**: Automatically ignores `node_modules`, `.git`, logs, etc.
- **Conflict Detection**: Warns about merge conflicts

## Stopping the Watcher

The watcher runs until you stop it. To stop:

1. **Using the stop script:**
   ```bash
   ./stop-auto-commit.sh
   ```

2. **Using npm:**
   ```bash
   npm run auto-commit:stop
   ```

3. **Manually:**
   ```bash
   kill $(cat auto-commit.pid)
   ```

## Running on System Startup

To start the watcher automatically when you log in:

### macOS (using launchd)

Create `~/Library/LaunchAgents/com.godspeed.autocommit.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.godspeed.autocommit</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/shortsread/.gemini/antigravity/scratch/aau_site/auto-commit.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/shortsread/.gemini/antigravity/scratch/aau_site</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Then load it:
```bash
launchctl load ~/Library/LaunchAgents/com.godspeed.autocommit.plist
```

## Need Help?

- Check `auto-commit.log` for detailed error messages
- Verify authentication is working: `git push origin main` (manual test)
- Make sure you're on the correct branch: `git branch`

## Summary

Once set up, you'll never need to manually commit and push again! Just:
1. Save your files
2. Wait 5 seconds
3. Changes are automatically on GitHub

The watcher runs silently in the background, logging everything to `auto-commit.log`.
