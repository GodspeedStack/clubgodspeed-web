"use client";

import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await signInWithEmailAndPassword(auth, email, password);
            router.push("/dashboard");
        } catch (err: any) {
            setError("Failed to log in. Please check your credentials.");
            console.error(err);
        }
    };

    return (
        <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4 font-sans text-[#1d1d1f]">
            <div className="bg-white p-8 rounded-3xl shadow-lg w-full max-w-md border border-gray-200">
                <h2 className="text-3xl font-bold mb-2 text-center uppercase tracking-tight">Parent <span className="text-[#0071e3]">Login</span></h2>
                <p className="text-center text-gray-500 mb-8">Access your athlete's performance data.</p>

                {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-black focus:outline-none focus:border-[#0071e3] transition-colors"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-black focus:outline-none focus:border-[#0071e3] transition-colors"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-[#0071e3] text-white font-bold py-3 rounded-full hover:bg-[#0077ed] transition-all shadow-md hover:shadow-lg"
                    >
                        LOG IN
                    </button>
                </form>
                <p className="text-center mt-6 text-sm text-gray-400">Powered by Godspeed Basketball</p>
            </div>
        </div>
    );
}
