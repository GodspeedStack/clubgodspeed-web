/**
 * Calendar Sync Configuration & Customization System
 * Manages polling interval, notifications, visual indicators, and monitoring
 */

const CalendarSyncConfig = (() => {
    // Default configuration
    const DEFAULT_CONFIG = {
        pollingIntervalMs: 30000, // 30 seconds
        notificationsEnabled: true,
        soundEnabled: false,
        soundVolume: 0.5,
        visualIndicatorsEnabled: true,
        showSyncBadge: true,
        showLastSyncTime: true,
        showStatusPulse: true,
        dbMonitoringEnabled: true,
        monitoringLogInterval: 10000 // Log metrics every 10 seconds
    };

    let config = { ...DEFAULT_CONFIG };
    let metrics = {
        totalQueries: 0,
        totalSubscriptions: 0,
        syncCount: 0,
        lastSyncTime: null,
        lastSyncDuration: 0,
        errorCount: 0,
        lastError: null,
        pollingTriggered: false,
        webSocketConnected: false,
        queryLog: []
    };

    /**
     * Load configuration from localStorage or use defaults
     */
    function loadConfig() {
        try {
            const stored = localStorage.getItem('godspeed_calendar_sync_config');
            if (stored) {
                config = { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
                console.log('✓ Loaded calendar sync config from storage:', config);
            }
        } catch (err) {
            console.warn('Failed to load sync config, using defaults:', err);
            config = { ...DEFAULT_CONFIG };
        }
    }

    /**
     * Save configuration to localStorage
     */
    function saveConfig() {
        try {
            localStorage.setItem('godspeed_calendar_sync_config', JSON.stringify(config));
            console.log('✓ Saved calendar sync config');
        } catch (err) {
            console.error('Failed to save sync config:', err);
        }
    }

    /**
     * Get current configuration
     */
    function getConfig() {
        return { ...config };
    }

    /**
     * Update specific config option
     */
    function setOption(key, value) {
        if (key in DEFAULT_CONFIG) {
            config[key] = value;
            saveConfig();
            console.log(`✓ Updated sync config: ${key} = ${value}`);
            return true;
        }
        console.warn(`Unknown config option: ${key}`);
        return false;
    }

    /**
     * Play notification sound (if enabled)
     */
    function playNotificationSound() {
        if (!config.soundEnabled) return;

        try {
            // Create a simple beep using Web Audio API
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // Subtle notification: 800Hz for 150ms
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(config.soundVolume, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.15);
        } catch (err) {
            console.warn('Failed to play notification sound:', err);
        }
    }

    /**
     * Show visual sync badge in calendar header
     */
    function updateSyncBadge(status = 'syncing') {
        if (!config.visualIndicatorsEnabled || !config.showSyncBadge) return;

        let badge = document.getElementById('sync-badge');
        if (!badge) {
            const headers = document.querySelectorAll('.calendar-header');
            if (headers.length === 0) return;

            badge = document.createElement('div');
            badge.id = 'sync-badge';
            badge.style.cssText = `
                position: absolute;
                top: 1.5rem;
                right: 2rem;
                padding: 0.5rem 1rem;
                border-radius: 6px;
                font-size: 0.875rem;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                z-index: 100;
            `;
            headers[0].parentElement.style.position = 'relative';
            headers[0].parentElement.appendChild(badge);
        }

        const statusConfig = {
            syncing: {
                text: 'Syncing...',
                bg: '#E3F2FD',
                color: '#1976D2',
                pulse: true
            },
            synced: {
                text: 'Synced',
                bg: '#E8F5E9',
                color: '#388E3C',
                pulse: false
            },
            error: {
                text: 'Sync Error',
                bg: '#FFEBEE',
                color: '#D32F2F',
                pulse: false
            },
            polling: {
                text: 'Polling',
                bg: '#FFF3E0',
                color: '#F57C00',
                pulse: true
            }
        };

        const s = statusConfig[status] || statusConfig.syncing;
        badge.style.background = s.bg;
        badge.style.color = s.color;
        badge.innerHTML = s.pulse ? `<span class="pulse-dot" style="display:inline-block;width:8px;height:8px;background:${s.color};border-radius:50%;animation:pulse 1.5s infinite;"></span>${s.text}` : s.text;
    }

    /**
     * Show last sync time in calendar
     */
    function updateLastSyncTime() {
        if (!config.visualIndicatorsEnabled || !config.showLastSyncTime) return;

        let timeEl = document.getElementById('last-sync-time');
        if (!timeEl) {
            const headers = document.querySelectorAll('.calendar-header');
            if (headers.length === 0) return;

            timeEl = document.createElement('div');
            timeEl.id = 'last-sync-time';
            timeEl.style.cssText = `
                position: absolute;
                bottom: -1.5rem;
                right: 2rem;
                font-size: 0.75rem;
                color: #86868b;
            `;
            headers[0].parentElement.appendChild(timeEl);
        }

        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        timeEl.textContent = `Last sync: ${timeStr}`;
    }

    /**
     * Log database query for monitoring
     */
    function logQuery(type, duration, rowCount = 0, error = null) {
        metrics.totalQueries++;

        const queryLog = {
            timestamp: new Date().toISOString(),
            type, // 'loadEvents', 'loadCancellations', 'refreshData'
            duration,
            rowCount,
            error: error ? error.message : null
        };

        metrics.queryLog.push(queryLog);

        // Keep only last 100 queries in memory
        if (metrics.queryLog.length > 100) {
            metrics.queryLog.shift();
        }

        if (error) {
            metrics.errorCount++;
            metrics.lastError = error;
        }
    }

    /**
     * Record sync event
     */
    function recordSync(duration, success = true) {
        metrics.syncCount++;
        metrics.lastSyncTime = new Date().toISOString();
        metrics.lastSyncDuration = duration;

        if (success) {
            updateSyncBadge('synced');
            updateLastSyncTime();
            if (config.notificationsEnabled) {
                playNotificationSound();
            }
        } else {
            updateSyncBadge('error');
        }
    }

    /**
     * Record polling activation (fallback)
     */
    function recordPollingActivated() {
        metrics.pollingTriggered = true;
        updateSyncBadge('polling');
        console.warn('⚠ WebSocket unavailable, using polling fallback');
    }

    /**
     * Record WebSocket connection status
     */
    function setWebSocketStatus(connected) {
        metrics.webSocketConnected = connected;
        if (connected) {
            console.log('✓ WebSocket connected');
        } else {
            console.warn('✗ WebSocket disconnected');
        }
    }

    /**
     * Get current metrics
     */
    function getMetrics() {
        return {
            ...metrics,
            uptime: Date.now(),
            config
        };
    }

    /**
     * Get monitoring summary
     */
    function getMonitoringSummary() {
        const avgQueryDuration = metrics.queryLog.length > 0
            ? metrics.queryLog.reduce((sum, q) => sum + q.duration, 0) / metrics.queryLog.length
            : 0;

        const errorRate = metrics.totalQueries > 0
            ? ((metrics.errorCount / metrics.totalQueries) * 100).toFixed(2)
            : 0;

        return {
            totalQueries: metrics.totalQueries,
            totalSyncs: metrics.syncCount,
            avgQueryDuration: Math.round(avgQueryDuration),
            lastSyncDuration: metrics.lastSyncDuration,
            errorCount: metrics.errorCount,
            errorRate: `${errorRate}%`,
            webSocketConnected: metrics.webSocketConnected,
            pollingActive: metrics.pollingTriggered,
            lastError: metrics.lastError,
            queryLog: metrics.queryLog.slice(-20) // Last 20 queries
        };
    }

    /**
     * Start periodic monitoring logs (optional, for debugging)
     */
    function startMonitoring() {
        if (!config.dbMonitoringEnabled) return;

        setInterval(() => {
            const summary = getMonitoringSummary();
            console.log('📊 Sync Monitoring Summary:', summary);
        }, config.monitoringLogInterval);
    }

    /**
     * Export metrics to console (for copying to spreadsheet/dashboard)
     */
    function exportMetrics() {
        const summary = getMonitoringSummary();
        console.table(summary);
        return summary;
    }

    // Initialize on load
    loadConfig();

    // Public API
    return {
        loadConfig,
        saveConfig,
        getConfig,
        setOption,
        playNotificationSound,
        updateSyncBadge,
        updateLastSyncTime,
        logQuery,
        recordSync,
        recordPollingActivated,
        setWebSocketStatus,
        getMetrics,
        getMonitoringSummary,
        startMonitoring,
        exportMetrics
    };
})();

// Add CSS animation for pulse effect
if (!document.getElementById('sync-pulse-style')) {
    const style = document.createElement('style');
    style.id = 'sync-pulse-style';
    style.textContent = `
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    `;
    document.head.appendChild(style);
}
