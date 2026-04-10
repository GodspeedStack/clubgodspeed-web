# Calendar Sync Customization & Monitoring Guide

## Overview

The real-time calendar synchronization system now includes comprehensive customization options and production-grade database monitoring. All features are optional and can be toggled on/off via an admin interface.

---

## Configuration System

### Location
- **Module:** `calendar-sync-config.js`
- **Storage:** Browser localStorage (key: `godspeed_calendar_sync_config`)
- **Access:** Globally available as `CalendarSyncConfig` object

### Available Settings

#### Polling Configuration
```javascript
pollingIntervalMs: 30000  // 5000-180000 ms (5s-3m), default 30s
```
**What it does:** When WebSocket connection fails, the system polls the database at this interval to check for new events.

**Recommendation:**
- Default `30000ms (30s)` balances responsiveness and database load
- Decrease to `10000ms (10s)` for aggressive sync (higher DB load)
- Increase to `60000ms (60s)` for relaxed sync (may miss updates 30-60s)

#### Notification Settings
```javascript
notificationsEnabled: true   // Enable browser notifications
soundEnabled: false          // Play audio notification
soundVolume: 0.5            // 0.0-1.0 (0%-100%)
```

**Sound:** Web Audio API generates a subtle 800Hz sine wave beep (150ms duration).

#### Visual Indicators
```javascript
visualIndicatorsEnabled: true  // Master toggle for all visual feedback
showSyncBadge: true           // "Syncing"/"Synced"/"Error" badge in header
showLastSyncTime: true        // Timestamp of last sync
showStatusPulse: true         // Animated pulse during sync
```

#### Database Monitoring
```javascript
dbMonitoringEnabled: true      // Track queries and performance
monitoringLogInterval: 10000   // Log metrics every 10 seconds to console
```

---

## Admin Configuration UI

### Access
Navigate to: `/admin-calendar-sync-settings.html`

### Features

#### Real-Time Metrics Dashboard
Shows live stats updated every 2 seconds:
- **Total Syncs** — Number of successful calendar refreshes
- **Total Queries** — Database queries executed
- **Avg Query Time** — Average query duration in milliseconds
- **Last Sync Duration** — Time of most recent sync
- **Error Rate** — Percentage of failed queries
- **WebSocket Status** — Connected / Disconnected
- **Polling Mode** — Yes (Active) / No

#### Settings Panel
- Polling interval slider (5s-180s)
- Toggle switches for all features
- Sound volume control with test button
- Save/Reset buttons

#### Export Metrics
Click "Export Metrics" to dump complete metrics to browser console as JSON. Copy and paste into spreadsheet or analysis tool.

---

## Monitoring & Database Tracking

### Query Logging

Every database operation is logged with:
```javascript
{
  timestamp: "2026-04-02T14:30:45.123Z",
  type: "loadPublishedEvents" | "loadPracticeCancellations" | "refreshData",
  duration: 245,  // milliseconds
  rowCount: 12,   // rows returned
  error: null     // error message if failed
}
```

### Metrics Tracked
- `totalQueries` — Cumulative count
- `totalSyncs` — Successful refreshes
- `syncCount` — Total sync events
- `errorCount` — Failed operations
- `lastSyncTime` — ISO timestamp
- `lastSyncDuration` — Milliseconds
- `queryLog` — Last 100 queries (FIFO)
- `webSocketConnected` — Boolean
- `pollingTriggered` — Boolean

### Console Output

When `dbMonitoringEnabled: true`, metrics are logged every 10 seconds (configurable):

```
📊 Sync Monitoring Summary:
{
  totalQueries: 42,
  totalSyncs: 8,
  avgQueryDuration: 187,
  lastSyncDuration: 245,
  errorCount: 0,
  errorRate: "0%",
  webSocketConnected: true,
  pollingActive: false,
  lastError: null,
  queryLog: [...]
}
```

### Performance Baseline

Healthy baseline values:
- **Query duration:** 100-300ms per database call
- **Sync duration:** 200-500ms total (two queries + render)
- **Error rate:** <1%
- **WebSocket:** Connected (unless network issue)

**Red flags:**
- Query time >1000ms (slow network or DB issue)
- Error rate >5% (RLS policy problem or auth issue)
- Polling mode active (WebSocket down)

---

## Usage Examples

### Setting Polling Interval Programmatically
```javascript
// From browser console or parent portal
CalendarSyncConfig.setOption('pollingIntervalMs', 15000);  // 15 seconds
```

### Enable Sounds for Parents
```javascript
CalendarSyncConfig.setOption('soundEnabled', true);
CalendarSyncConfig.setOption('soundVolume', 0.7);
```

### Get Current Configuration
```javascript
const config = CalendarSyncConfig.getConfig();
console.log(config);
```

### Export Metrics for Analysis
```javascript
const summary = CalendarSyncConfig.exportMetrics();
// Copy to spreadsheet or JSON file
```

### Play Test Sound
```javascript
CalendarSyncConfig.playNotificationSound();
```

---

## Deployment Notes

### Production Configuration

Recommended settings for production:
```javascript
pollingIntervalMs: 30000,         // Balanced polling
soundEnabled: false,              // No sounds (can be toggled per parent)
visualIndicatorsEnabled: true,    // Help debug issues
showSyncBadge: true,             // Transparency
dbMonitoringEnabled: false,      // Reduce console noise
monitoringLogInterval: 30000     // Check every 30s if enabled
```

### Performance Impact

- **WebSocket subscription:** ~0 KB additional download (reuses existing Supabase client)
- **Config storage:** ~1 KB localStorage
- **Memory overhead:** ~50 KB (100 query logs in memory)
- **Network overhead:** None (subscription uses existing WebSocket connection)

### Scaling Considerations

At scale (1000+ concurrent parents):
- Monitor WebSocket connection count in Supabase dashboard
- Average query time may increase 20-30%
- Consider adding Redis caching layer if polling becomes heavy
- Use filtering to exclude non-public events

---

## Troubleshooting

### Polling Active When WebSocket Should Work
**Symptom:** `pollingActive: true` but network appears fine

**Causes:**
1. Supabase real-time service down — check status.supabase.com
2. Browser extension blocking WebSocket — try incognito mode
3. VPN/firewall blocking WebSocket protocol

**Fix:** Real-time fallback to polling is working correctly. No action needed.

### High Error Rate
**Symptom:** `errorRate >5%`

**Causes:**
1. RLS policy issue — parent doesn't have access to events
2. Invalid query filter in subscription
3. Supabase rate limiting

**Debug:**
- Check browser console for specific error messages
- Verify parent has `approved` status in database
- Check RLS policies on calendar_events table

### Slow Sync Times
**Symptom:** `lastSyncDuration >1000ms`

**Causes:**
1. Slow internet connection
2. Database slow (check Supabase metrics)
3. Browser tab in background (throttling)

**Debug:**
- Check individual query times in `queryLog`
- Verify browser DevTools Performance tab
- Test from different network connection

### Sound Not Playing
**Symptom:** `soundEnabled: true` but no beep

**Causes:**
1. Browser tab muted
2. System volume muted
3. Browser privacy blocking Web Audio API

**Debug:**
- Check browser tab audio indicator
- Try test button in settings UI
- Check browser privacy/permissions settings

---

## Architecture

### Module: calendar-sync-config.js

**Public API:**
```javascript
CalendarSyncConfig.loadConfig()           // Load from localStorage
CalendarSyncConfig.saveConfig()           // Save to localStorage
CalendarSyncConfig.getConfig()            // Get current config object
CalendarSyncConfig.setOption(key, value)  // Update single option
CalendarSyncConfig.playNotificationSound()
CalendarSyncConfig.updateSyncBadge(status)
CalendarSyncConfig.updateLastSyncTime()
CalendarSyncConfig.logQuery(type, duration, rowCount, error)
CalendarSyncConfig.recordSync(duration, success)
CalendarSyncConfig.recordPollingActivated()
CalendarSyncConfig.setWebSocketStatus(connected)
CalendarSyncConfig.getMetrics()           // Get full metrics object
CalendarSyncConfig.getMonitoringSummary() // Get formatted summary
CalendarSyncConfig.startMonitoring()      // Begin periodic logging
CalendarSyncConfig.exportMetrics()        // Export to console
```

**Lifecycle:**
1. Script loads → `loadConfig()` from localStorage or use defaults
2. Calendar calls functions: `logQuery()`, `recordSync()`, etc.
3. Metrics accumulated in memory
4. Periodic logging (if enabled) dumps summary to console
5. Page refresh → metrics reset, localStorage persists config

---

## Future Enhancements

Possible additions:
- [ ] Webhook notifications to Slack/Discord on errors
- [ ] Custom alert thresholds (e.g., alert if sync >5s)
- [ ] Historical metrics storage (IndexedDB)
- [ ] Real-time dashboard embedded in admin portal
- [ ] A/B testing different polling intervals
- [ ] Client-side caching to reduce queries
- [ ] Compression of query logs for long-term analysis

---

## Support

For issues:
1. Open browser DevTools (F12)
2. Run: `CalendarSyncConfig.exportMetrics()`
3. Share console output for debugging
