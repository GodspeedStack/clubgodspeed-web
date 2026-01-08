"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [resetEmailSent, setResetEmailSent] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            router.push("/dashboard");
        } catch (err: unknown) {
            const error = err as { code?: string };
            if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password" || error.code === "auth/user-not-found") {
                setError("Invalid email or password. Please try again.");
            } else if (error.code === "auth/too-many-requests") {
                setError("Too many failed attempts. Please try again later.");
            } else if (error.code === "auth/network-request-failed") {
                setError("Network error. Please check your connection.");
            } else {
                setError("Login failed. Please try again.");
            }
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!email) {
            setError("Please enter your email address first.");
            return;
        }

        setError("");
        setLoading(true);

        try {
            await sendPasswordResetEmail(auth, email);
            setResetEmailSent(true);
        } catch (err: unknown) {
            const error = err as { code?: string };
            if (error.code === "auth/user-not-found") {
                setError("No account found with this email.");
            } else if (error.code === "auth/invalid-email") {
                setError("Please enter a valid email address.");
            } else {
                setError("Failed to send reset email. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4 font-sans text-[#1d1d1f]">
            <div className="bg-white p-8 rounded-3xl shadow-lg w-full max-w-md border border-gray-200">
                <h2 className="text-3xl font-bold mb-2 text-center uppercase tracking-tight">Parent <span className="text-[#0071e3]">Login</span></h2>
                <p className="text-center text-gray-500 mb-8">Access your athlete's performance data.</p>

                {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
                {resetEmailSent && <p className="text-green-600 text-sm mb-4 text-center">Password reset email sent! Check your inbox.</p>}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setResetEmailSent(false);
                            }}
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-black focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3] focus:ring-opacity-20 transition-colors"
                            required
                            disabled={loading}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full p-3 pr-12 bg-gray-50 border border-gray-200 rounded-lg text-black focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3] focus:ring-opacity-20 transition-colors"
                                required
                                disabled={loading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 text-sm font-medium"
                                disabled={loading}
                            >
                                {showPassword ? "Hide" : "Show"}
                            </button>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#0071e3] text-white font-bold py-3 rounded-full hover:bg-[#0077ed] disabled:bg-gray-400 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>LOGGING IN...</span>
                            </>
                        ) : (
                            "LOG IN"
                        )}
                    </button>
                </form>

                <button
                    type="button"
                    onClick={handlePasswordReset}
                    disabled={loading}
                    className="w-full mt-3 text-sm text-[#0071e3] hover:text-[#0077ed] disabled:text-gray-400 font-medium transition-colors"
                >
                    Forgot password?
                </button>

                <p className="text-center mt-6 text-sm text-gray-400">Powered by Godspeed Basketball</p>
            </div>
        </div>
    );
}
