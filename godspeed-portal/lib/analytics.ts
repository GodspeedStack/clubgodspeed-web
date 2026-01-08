/**
 * Google Analytics Configuration
 *
 * Setup Instructions:
 * 1. Go to https://analytics.google.com
 * 2. Create a new GA4 property
 * 3. Copy your Measurement ID (G-XXXXXXXXXX)
 * 4. Add to .env.local: NEXT_PUBLIC_GA_TRACKING_ID=G-XXXXXXXXXX
 */

// Google Analytics Measurement ID
export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_TRACKING_ID || "";

// Check if GA is enabled
export const isGAEnabled = !!GA_TRACKING_ID && process.env.NODE_ENV === "production";

/**
 * Page view tracking
 */
export const pageview = (url: string) => {
    if (!isGAEnabled) return;

    if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("config", GA_TRACKING_ID, {
            page_path: url,
        });
    }
};

/**
 * Event tracking
 */
interface EventParams {
    action: string;
    category: string;
    label?: string;
    value?: number;
}

export const event = ({ action, category, label, value }: EventParams) => {
    if (!isGAEnabled) {
        console.log("GA Event:", { action, category, label, value });
        return;
    }

    if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", action, {
            event_category: category,
            event_label: label,
            value: value,
        });
    }
};

/**
 * Common event helpers
 */
export const trackLogin = (method: string) => {
    event({
        action: "login",
        category: "engagement",
        label: method,
    });
};

export const trackLogout = () => {
    event({
        action: "logout",
        category: "engagement",
    });
};

export const trackCardShare = (athleteName: string) => {
    event({
        action: "share_card",
        category: "social",
        label: athleteName,
    });
};

export const trackCardDownload = (athleteName: string) => {
    event({
        action: "download_card",
        category: "engagement",
        label: athleteName,
    });
};

export const trackError = (errorMessage: string) => {
    event({
        action: "error",
        category: "technical",
        label: errorMessage,
    });
};

export const trackPasswordReset = (success: boolean) => {
    event({
        action: "password_reset",
        category: "engagement",
        label: success ? "success" : "failed",
    });
};

/**
 * Performance tracking
 */
export const trackTiming = (category: string, variable: string, time: number) => {
    if (!isGAEnabled) return;

    if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("event", "timing_complete", {
            name: variable,
            value: time,
            event_category: category,
        });
    }
};
