#!/usr/bin/env node

/**
 * Auto-Commit Script
 * Automatically commits and pushes changes when files are saved
 */

const chokidar = require('chokidar');
const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const config = require('./auto-commit.config.js');

// Initialize git
const git = simpleGit(process.cwd());

// Logging utility
const logFile = path.join(process.cwd(), config.logFile);
const log = (level, message) => {
 const timestamp = new Date().toISOString();
 const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
 if (!config.quiet) {
 console.log(`[${level.toUpperCase()}] ${message}`);
 }
 fs.appendFileSync(logFile, logMessage, 'utf8');
};

// PID file for process management
const pidFile = path.join(process.cwd(), 'auto-commit.pid');

// Write PID file
fs.writeFileSync(pidFile, process.pid.toString(), 'utf8');

// Cleanup on exit
process.on('SIGINT', () => {
 log('info', 'Stopping auto-commit watcher...');
 if (fs.existsSync(pidFile)) {
 fs.unlinkSync(pidFile);
 }
 process.exit(0);
});

process.on('SIGTERM', () => {
 log('info', 'Stopping auto-commit watcher...');
 if (fs.existsSync(pidFile)) {
 fs.unlinkSync(pidFile);
 }
 process.exit(0);
});

// Track changed files
let changedFiles = new Set();
let commitTimeout = null;

// Generate commit message from changed files
function generateCommitMessage(files) {
 if (!config.commitMessage.generateFromFiles) {
 return `${config.commitMessage.prefix}: ${config.commitMessage.default}`;
 }
 const fileArray = Array.from(files);
 const fileTypes = {};
 fileArray.forEach(file => {
 const ext = path.extname(file).toLowerCase();
 const type = ext || 'other';
 fileTypes[type] = (fileTypes[type] || 0) + 1;
 });
 // Analyze file types
 const descriptions = [];
 if (fileTypes['.js'] || fileTypes['.jsx']) descriptions.push('JavaScript');
 if (fileTypes['.html']) descriptions.push('HTML');
 if (fileTypes['.css']) descriptions.push('CSS');
 if (fileTypes['.md']) descriptions.push('Documentation');
 if (fileTypes['.json']) descriptions.push('Configuration');
 if (fileTypes['.png'] || fileTypes['.jpg'] || fileTypes['.jpeg'] || fileTypes['.svg']) descriptions.push('Assets');
 const mainType = descriptions[0] || 'Files';
 const fileCount = fileArray.length;
 const fileWord = fileCount === 1 ? 'file' : 'files';
 let message = `${config.commitMessage.prefix}: Update ${mainType.toLowerCase()}`;
 if (fileCount > 1) {
 message += ` (${fileCount} ${fileWord})`;
 }
 // Add specific file names if few files changed
 if (fileCount <= 3) {
 const fileNames = fileArray.map(f => path.basename(f)).join(', ');
 message += ` - ${fileNames}`;
 }
 return message;
}

// Commit and push changes
async function commitAndPush() {
 if (changedFiles.size === 0) {
 return;
 }
 const files = Array.from(changedFiles);
 changedFiles.clear();
 log('info', `Committing ${files.length} changed file(s)...`);
 try {
 // Check if there are any changes to commit
 const status = await git.status();
 if (status.files.length === 0) {
 log('info', 'No changes to commit');
 return;
 }
 // Stage all changes
 await git.add('.');
 log('debug', 'Staged all changes');
 // Generate commit message
 const commitMessage = generateCommitMessage(files);
 log('debug', `Commit message: ${commitMessage}`);
 // Commit
 await git.commit(commitMessage);
 log('info', `Committed: ${commitMessage}`);
 // Push if enabled
 if (config.autoPush) {
 try {
 // Pull first if configured
 if (config.pullBeforePush) {
 log('info', 'Pulling latest changes...');
 await git.pull(config.remote, config.branch, ['--no-rebase']);
 }
 // Push to remote
 log('info', `Pushing to ${config.remote}/${config.branch}...`);
 const pushOptions = config.forcePush ? ['--force'] : [];
 await git.push(config.remote, config.branch, pushOptions);
 log('info', 'Successfully pushed to remote');
 } catch (pushError) {
 log('error', `Push failed: ${pushError.message}`);
 // Don't throw - allow watcher to continue
 }
 }
 } catch (error) {
 log('error', `Commit failed: ${error.message}`);
 // Handle specific error cases
 if (error.message.includes('nothing to commit')) {
 log('info', 'No changes to commit');
 } else if (error.message.includes('conflict')) {
 log('warn', 'Merge conflict detected - manual intervention required');
 } else if (error.message.includes('Permission denied') || error.message.includes('publickey')) {
 log('error', 'Authentication failed - check SSH keys or GitHub token');
 log('info', 'See AUTO_COMMIT_SETUP.md for authentication setup');
 } else {
 log('error', `Error details: ${error.stack}`);
 }
 }
}

// Handle file changes
function handleFileChange(filePath) {
 // Check if file should be ignored
 const shouldIgnore = config.ignorePatterns.some(pattern => {
 const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
 return regex.test(filePath);
 });
 if (shouldIgnore) {
 return;
 }
 changedFiles.add(filePath);
 log('debug', `File changed: ${filePath}`);
 // Clear existing timeout
 if (commitTimeout) {
 clearTimeout(commitTimeout);
 }
 // Set new timeout for debouncing
 commitTimeout = setTimeout(() => {
 commitAndPush();
 }, config.debounceDelay);
}

// Initialize file watcher
log('info', 'Starting auto-commit file watcher...');
log('info', `Watching: ${config.watchPaths.join(', ')}`);
log('info', `Debounce delay: ${config.debounceDelay}ms`);
log('info', `Branch: ${config.branch}, Remote: ${config.remote}`);

// Create watcher
const watcher = chokidar.watch(config.watchPaths, {
 ignored: config.ignorePatterns,
 persistent: true,
 ignoreInitial: true,
 awaitWriteFinish: {
 stabilityThreshold: 1000,
 pollInterval: 100
 }
});

// Watch for file changes
watcher
 .on('add', handleFileChange)
 .on('change', handleFileChange)
 .on('unlink', handleFileChange)
 .on('error', error => {
 log('error', `Watcher error: ${error.message}`);
 })
 .on('ready', () => {
 log('info', 'File watcher ready. Monitoring for changes...');
 log('info', 'Press Ctrl+C to stop');
 });

// Keep process alive
process.stdin.resume();
