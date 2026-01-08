"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Bell, Mail, MessageSquare, Calendar, DollarSign, User, Shield, Moon, Sun, Globe } from "lucide-react";
import { useToast } from "@/app/context/ToastContext";

interface NotificationSettings {
    emailNotifications: {
        newMessages: boolean;
        scheduleUpdates: boolean;
        paymentReminders: boolean;
        performanceReports: boolean;
    };
    pushNotifications: {
        newMessages: boolean;
        scheduleUpdates: boolean;
        upcomingEvents: boolean;
    };
    preferences: {
        theme: "light" | "dark" | "auto";
        language: string;
        timezone: string;
    };
}

export default function SettingsPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const toast = useToast();

    const [settings, setSettings] = useState<NotificationSettings>({
        emailNotifications: {
            newMessages: true,
            scheduleUpdates: true,
            paymentReminders: true,
            performanceReports: false,
        },
        pushNotifications: {
            newMessages: true,
            scheduleUpdates: false,
            upcomingEvents: true,
        },
        preferences: {
            theme: "light",
            language: "en",
            timezone: "America/New_York",
        },
    });

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        } else if (user) {
            fetchSettings();
        }
    }, [user, loading, router]);

    const fetchSettings = async () => {
        if (!user) return;

        try {
            const settingsRef = doc(db, "parents", user.uid, "settings", "preferences");
            const settingsDoc = await getDoc(settingsRef);

            if (settingsDoc.exists()) {
                setSettings(settingsDoc.data() as NotificationSettings);
            }
            // If no settings exist, keep default state
        } catch (error) {
            console.error("Error fetching settings:", error);
            toast.error("Failed to load settings. Using defaults.");
        }
    };

    const handleSave = async () => {
        if (!user) return;

        setSaving(true);

        try {
            const settingsRef = doc(db, "parents", user.uid, "settings", "preferences");
            await setDoc(settingsRef, settings);
            toast.success("Settings saved successfully!");
        } catch (error) {
            console.error("Error saving settings:", error);
            toast.error("Failed to save settings. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const toggleEmailNotification = (key: keyof NotificationSettings["emailNotifications"]) => {
        setSettings({
            ...settings,
            emailNotifications: {
                ...settings.emailNotifications,
                [key]: !settings.emailNotifications[key],
            },
        });
    };

    const togglePushNotification = (key: keyof NotificationSettings["pushNotifications"]) => {
        setSettings({
            ...settings,
            pushNotifications: {
                ...settings.pushNotifications,
                [key]: !settings.pushNotifications[key],
            },
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
                <div className="animate-pulse text-[#0071e3] font-bold text-xl">Loading Settings...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f] animate-fadeIn">
            {/* Navbar */}
            <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100 px-4 sm:px-6 py-4 flex justify-between items-center">
                <div className="font-extrabold tracking-widest text-sm sm:text-base md:text-lg">
                    GODSPEED<span className="text-[#0071e3]">SETTINGS</span>
                </div>
                <button
                    onClick={() => router.push("/dashboard")}
                    className="text-sm font-semibold text-gray-500 hover:text-black transition-all duration-200 hover:scale-105"
                >
                    ← BACK
                </button>
            </nav>

            {/* Main Content */}
            <main className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-4xl">
                {/* Header */}
                <header className="mb-8 sm:mb-12">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold uppercase tracking-tight mb-2">
                        Account <span className="text-[#0071e3]">Settings</span>
                    </h1>
                    <p className="text-sm sm:text-base text-gray-500">Manage notifications and preferences</p>
                </header>

                {/* Settings Sections */}
                <div className="space-y-6">
                    {/* Email Notifications */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm animate-slideUp">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-blue-100 rounded-xl">
                                <Mail className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Email Notifications</h2>
                                <p className="text-sm text-gray-600">Choose what you want to be notified about via email</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <MessageSquare className="w-5 h-5 text-gray-600" />
                                    <div>
                                        <div className="font-semibold text-gray-900">New Messages</div>
                                        <div className="text-xs text-gray-600">Get notified when a coach sends you a message</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => toggleEmailNotification("newMessages")}
                                    className={`relative w-12 h-6 rounded-full transition-colors ${
                                        settings.emailNotifications.newMessages ? "bg-[#0071e3]" : "bg-gray-300"
                                    }`}
                                >
                                    <div
                                        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                            settings.emailNotifications.newMessages ? "translate-x-6" : ""
                                        }`}
                                    />
                                </button>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <Calendar className="w-5 h-5 text-gray-600" />
                                    <div>
                                        <div className="font-semibold text-gray-900">Schedule Updates</div>
                                        <div className="text-xs text-gray-600">Practice and game schedule changes</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => toggleEmailNotification("scheduleUpdates")}
                                    className={`relative w-12 h-6 rounded-full transition-colors ${
                                        settings.emailNotifications.scheduleUpdates ? "bg-[#0071e3]" : "bg-gray-300"
                                    }`}
                                >
                                    <div
                                        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                            settings.emailNotifications.scheduleUpdates ? "translate-x-6" : ""
                                        }`}
                                    />
                                </button>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <DollarSign className="w-5 h-5 text-gray-600" />
                                    <div>
                                        <div className="font-semibold text-gray-900">Payment Reminders</div>
                                        <div className="text-xs text-gray-600">Reminders for upcoming dues and fees</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => toggleEmailNotification("paymentReminders")}
                                    className={`relative w-12 h-6 rounded-full transition-colors ${
                                        settings.emailNotifications.paymentReminders ? "bg-[#0071e3]" : "bg-gray-300"
                                    }`}
                                >
                                    <div
                                        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                            settings.emailNotifications.paymentReminders ? "translate-x-6" : ""
                                        }`}
                                    />
                                </button>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <Bell className="w-5 h-5 text-gray-600" />
                                    <div>
                                        <div className="font-semibold text-gray-900">Performance Reports</div>
                                        <div className="text-xs text-gray-600">Weekly athlete performance summaries</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => toggleEmailNotification("performanceReports")}
                                    className={`relative w-12 h-6 rounded-full transition-colors ${
                                        settings.emailNotifications.performanceReports ? "bg-[#0071e3]" : "bg-gray-300"
                                    }`}
                                >
                                    <div
                                        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                            settings.emailNotifications.performanceReports ? "translate-x-6" : ""
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Push Notifications */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm animate-slideUp" style={{ animationDelay: "100ms" }}>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-purple-100 rounded-xl">
                                <Bell className="w-6 h-6 text-purple-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Push Notifications</h2>
                                <p className="text-sm text-gray-600">Receive instant notifications on your device</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <MessageSquare className="w-5 h-5 text-gray-600" />
                                    <div>
                                        <div className="font-semibold text-gray-900">New Messages</div>
                                        <div className="text-xs text-gray-600">Real-time message alerts</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => togglePushNotification("newMessages")}
                                    className={`relative w-12 h-6 rounded-full transition-colors ${
                                        settings.pushNotifications.newMessages ? "bg-[#0071e3]" : "bg-gray-300"
                                    }`}
                                >
                                    <div
                                        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                            settings.pushNotifications.newMessages ? "translate-x-6" : ""
                                        }`}
                                    />
                                </button>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <Calendar className="w-5 h-5 text-gray-600" />
                                    <div>
                                        <div className="font-semibold text-gray-900">Schedule Changes</div>
                                        <div className="text-xs text-gray-600">Instant alerts for schedule updates</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => togglePushNotification("scheduleUpdates")}
                                    className={`relative w-12 h-6 rounded-full transition-colors ${
                                        settings.pushNotifications.scheduleUpdates ? "bg-[#0071e3]" : "bg-gray-300"
                                    }`}
                                >
                                    <div
                                        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                            settings.pushNotifications.scheduleUpdates ? "translate-x-6" : ""
                                        }`}
                                    />
                                </button>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <Bell className="w-5 h-5 text-gray-600" />
                                    <div>
                                        <div className="font-semibold text-gray-900">Upcoming Events</div>
                                        <div className="text-xs text-gray-600">Reminders 24 hours before events</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => togglePushNotification("upcomingEvents")}
                                    className={`relative w-12 h-6 rounded-full transition-colors ${
                                        settings.pushNotifications.upcomingEvents ? "bg-[#0071e3]" : "bg-gray-300"
                                    }`}
                                >
                                    <div
                                        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                            settings.pushNotifications.upcomingEvents ? "translate-x-6" : ""
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Account Info */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm animate-slideUp" style={{ animationDelay: "200ms" }}>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-gray-100 rounded-xl">
                                <User className="w-6 h-6 text-gray-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Account Information</h2>
                                <p className="text-sm text-gray-600">Your account details and security</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                <div>
                                    <div className="font-semibold text-gray-900">Email</div>
                                    <div className="text-sm text-gray-600">{user?.email}</div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                <div>
                                    <div className="font-semibold text-gray-900">Account Type</div>
                                    <div className="text-sm text-gray-600">Parent Portal Access</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Save Button */}
                <div className="mt-8 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-[#0071e3] text-white px-8 py-3 rounded-full font-bold text-sm hover:bg-[#005bb5] hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-xl disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {saving ? (
                            <>
                                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                SAVING...
                            </>
                        ) : (
                            "SAVE CHANGES"
                        )}
                    </button>
                </div>
            </main>
        </div>
    );
}
