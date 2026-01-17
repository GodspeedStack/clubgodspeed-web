import { defineConfig } from 'vite';
import { appendFileSync } from 'node:fs';

const DEBUG_LOG_PATH = '/Users/godspeed-stack/Projects/clubgodspeed-web/.cursor/debug.log';
const logDebug = (payload) => {
  try {
    appendFileSync(DEBUG_LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch (_) {}
};

// #region agent log
const topLevelPayload = {
  sessionId: 'debug-session',
  runId: 'pre-fix',
  hypothesisId: 'H5',
  location: 'vite.config.js:top-level',
  message: 'Vite config evaluated',
  data: { cwd: process.cwd(), node: process.version, argv: process.argv },
  timestamp: Date.now()
};
logDebug(topLevelPayload);
fetch('http://127.0.0.1:7242/ingest/235294b9-c5ef-418c-b176-522429e4841b', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(topLevelPayload)
}).catch(() => {});
// #endregion

export default defineConfig({
  root: '.',
  plugins: [
    {
      name: 'debug-loopback',
      configureServer(server) {
        const serverHost = server?.config?.server?.host;
        const serverPort = server?.config?.server?.port;
        const middlewareMode = server?.config?.server?.middlewareMode;
        const https = server?.config?.server?.https;
        const hmr = server?.config?.server?.hmr;
        const cors = server?.config?.server?.cors;
        // #region agent log
        const configurePayload = {
          sessionId: 'debug-session',
          runId: 'pre-fix',
          hypothesisId: 'H2',
          location: 'vite.config.js:configureServer',
          message: 'Vite configureServer invoked',
          data: { host: serverHost, port: serverPort, middlewareMode, https, hmr, cors, hasHttpServer: !!server?.httpServer },
          timestamp: Date.now()
        };
        logDebug(configurePayload);
        fetch('http://127.0.0.1:7242/ingest/235294b9-c5ef-418c-b176-522429e4841b', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configurePayload)
        }).catch(() => {});
        // #endregion

        if (!server?.httpServer) {
          // #region agent log
          const noHttpPayload = {
            sessionId: 'debug-session',
            runId: 'pre-fix',
            hypothesisId: 'H2',
            location: 'vite.config.js:no-httpServer',
            message: 'Vite server.httpServer missing',
            data: { host: serverHost, port: serverPort },
            timestamp: Date.now()
          };
          logDebug(noHttpPayload);
          fetch('http://127.0.0.1:7242/ingest/235294b9-c5ef-418c-b176-522429e4841b', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(noHttpPayload)
          }).catch(() => {});
          // #endregion
        }

        server?.httpServer?.on('listening', () => {
          const address = server?.httpServer?.address?.();
          // #region agent log
          const listeningPayload = {
            sessionId: 'debug-session',
            runId: 'pre-fix',
            hypothesisId: 'H2',
            location: 'vite.config.js:server.listen',
            message: 'Vite HTTP server listening',
            data: { address },
            timestamp: Date.now()
          };
          logDebug(listeningPayload);
          fetch('http://127.0.0.1:7242/ingest/235294b9-c5ef-418c-b176-522429e4841b', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(listeningPayload)
          }).catch(() => {});
          // #endregion
        });

        server?.httpServer?.on('error', (err) => {
          // #region agent log
          const errorPayload = {
            sessionId: 'debug-session',
            runId: 'pre-fix',
            hypothesisId: 'H3',
            location: 'vite.config.js:server.error',
            message: 'Vite HTTP server error',
            data: { name: err?.name, message: err?.message, code: err?.code },
            timestamp: Date.now()
          };
          logDebug(errorPayload);
          fetch('http://127.0.0.1:7242/ingest/235294b9-c5ef-418c-b176-522429e4841b', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(errorPayload)
          }).catch(() => {});
          // #endregion
        });

        server?.httpServer?.on('close', () => {
          // #region agent log
          const closePayload = {
            sessionId: 'debug-session',
            runId: 'pre-fix',
            hypothesisId: 'H4',
            location: 'vite.config.js:server.close',
            message: 'Vite HTTP server closed',
            data: { host: serverHost, port: serverPort },
            timestamp: Date.now()
          };
          logDebug(closePayload);
          fetch('http://127.0.0.1:7242/ingest/235294b9-c5ef-418c-b176-522429e4841b', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(closePayload)
          }).catch(() => {});
          // #endregion
        });

        server?.middlewares?.use((req, _res, next) => {
          // #region agent log
          const requestPayload = {
            sessionId: 'debug-session',
            runId: 'pre-fix',
            hypothesisId: 'H1',
            location: 'vite.config.js:middlewares',
            message: 'HTTP request observed by Vite dev server',
            data: { method: req?.method, url: req?.url, headers: { host: req?.headers?.host } },
            timestamp: Date.now()
          };
          logDebug(requestPayload);
          fetch('http://127.0.0.1:7242/ingest/235294b9-c5ef-418c-b176-522429e4841b', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
          }).catch(() => {});
          // #endregion
          next();
        });
      }
    }
  ],
  server: {
    port: 5173,
    strictPort: true,
    host: 'localhost',
    open: false,
    watch: {
      ignored: [
        '**/_current_backup_before_reset/**',
        '**/_broken_backup/**',
        '**/node_modules/**',
        '**/.git/**'
      ]
    }
  },
  publicDir: 'public'
});
