/**
 * Auto-Commit Configuration
 * Customize these settings to match your workflow
 */

module.exports = {
    // Git settings
    branch: 'main',
    remote: 'origin',
    
    // File watching settings
    watchPaths: [
        '.', // Watch entire project
    ],
    
    // Files/patterns to ignore
    ignorePatterns: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.DS_Store',
        '**/Thumbs.db',
        '**/.env',
        '**/.env.local',
        '**/.env.production',
        '**/dist/**',
        '**/build/**',
        '**/.cache/**',
        '**/.netlify/**',
        '**/.firebase/**',
        '**/*.log',
        '**/auto-commit.log',
        '**/auto-commit.pid',
        '**/_current_backup_before_reset/**',
        '**/_broken_backup/**',
    ],
    
    // Debounce delay (milliseconds)
    // Waits this long after last file change before committing
    debounceDelay: 5000, // 5 seconds
    
    // Commit message settings
    commitMessage: {
        // Generate message based on changed files
        generateFromFiles: true,
        // Default message if can't determine from files
        default: 'Auto-commit: File changes',
        // Prefix for all auto-commits
        prefix: 'Auto-commit',
    },
    
    // Logging settings
    logFile: 'auto-commit.log',
    logLevel: 'info', // 'debug', 'info', 'warn', 'error'
    
    // Git authentication
    // Set GITHUB_TOKEN in .env file for HTTPS authentication
    // Or ensure SSH keys are properly configured
    useHTTPS: false, // Set to true to use HTTPS with token instead of SSH
    
    // Safety settings
    autoPush: true, // Automatically push after commit
    forcePush: false, // Never force push (safety)
    pullBeforePush: false, // Pull before pushing (recommended for shared repos)
    
    // Notification settings
    showNotifications: false, // Show desktop notifications (requires node-notifier)
    quiet: false, // Suppress console output
};
