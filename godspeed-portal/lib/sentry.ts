/**
 * Sentry Configuration for Error Monitoring
 *
 * Setup Instructions:
 * 1. Sign up at https://sentry.io
 * 2. Create a new project (select "Next.js")
 * 3. Copy your DSN from Project Settings > Client Keys
 * 4. Add to .env.local: NEXT_PUBLIC_SENTRY_DSN=your_dsn_here
 * 5. Install Sentry: npm install @sentry/nextjs
 */

// Uncomment after installing @sentry/nextjs
// import * as Sentry from "@sentry/nextjs";

export const initSentry = () => {
    // Check if Sentry DSN is configured
    const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

    if (!sentryDsn) {
        console.warn("Sentry DSN not configured. Error monitoring disabled.");
        return;
    }

    // Uncomment after installing @sentry/nextjs
    /*
    Sentry.init({
        dsn: sentryDsn,

        // Set tracesSampleRate to 1.0 to capture 100% of transactions
        // Lower in production to reduce quota usage
        tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

        // Set sampling rate for profiling
        profilesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

        // Environment
        environment: process.env.NODE_ENV || "development",

        // Release tracking
        release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "development",

        // Ignore common errors
        ignoreErrors: [
            // Browser extensions
            "top.GLOBALS",
            "canvas.contentDocument",
            // Network errors
            "NetworkError",
            "Failed to fetch",
            // Random plugins/extensions
            "Can't find variable: ZiteReader",
            "jigsaw is not defined",
            "ComboSearch is not defined",
        ],

        // Filter out sensitive data
        beforeSend(event, hint) {
            // Remove sensitive user data
            if (event.user) {
                delete event.user.email;
                delete event.user.ip_address;
            }

            // Filter out certain URLs
            if (event.request?.url?.includes("password")) {
                return null;
            }

            return event;
        },
    });
    */
};

/**
 * Manually capture an exception
 */
export const captureException = (error: Error, context?: Record<string, any>) => {
    if (process.env.NODE_ENV === "development") {
        console.error("Error captured:", error, context);
        return;
    }

    // Uncomment after installing @sentry/nextjs
    /*
    Sentry.captureException(error, {
        extra: context,
    });
    */
};

/**
 * Manually capture a message
 */
export const captureMessage = (message: string, level: "info" | "warning" | "error" = "info") => {
    if (process.env.NODE_ENV === "development") {
        console.log(`[${level}]`, message);
        return;
    }

    // Uncomment after installing @sentry/nextjs
    /*
    Sentry.captureMessage(message, level);
    */
};

/**
 * Set user context for error tracking
 */
export const setUser = (user: { id: string; email?: string } | null) => {
    // Uncomment after installing @sentry/nextjs
    /*
    if (user) {
        Sentry.setUser({
            id: user.id,
            // Don't include email for privacy
        });
    } else {
        Sentry.setUser(null);
    }
    */
};

/**
 * Add breadcrumb for debugging
 */
export const addBreadcrumb = (message: string, category: string, data?: Record<string, any>) => {
    // Uncomment after installing @sentry/nextjs
    /*
    Sentry.addBreadcrumb({
        message,
        category,
        data,
        level: "info",
    });
    */
};
