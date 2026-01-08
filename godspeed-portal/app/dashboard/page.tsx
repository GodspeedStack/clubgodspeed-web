"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import AthleteTradingCard from "@/app/components/AthleteTradingCard";
import { AthleteDashboardSkeleton } from "@/app/components/Skeleton";

interface Athlete {
    id: string;
    name: string;
    team: string;
    number?: string;
    position?: string;
    height?: string;
    gradYear?: string;
    photoUrl?: string;
    status?: string;
}

export default function DashboardPage() {
    const { user, loading, loggingOut, logout } = useAuth();
    const router = useRouter();
    const [athletes, setAthletes] = useState<Athlete[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAthletes = async () => {
        if (!user) return;

        try {
            const athletesRef = collection(db, "parents", user.uid, "athletes");
            const querySnapshot = await getDocs(athletesRef);
            const athletesList: Athlete[] = [];
            querySnapshot.forEach((doc) => {
                athletesList.push({ id: doc.id, ...doc.data() } as Athlete);
            });
            setAthletes(athletesList);
            setError(null);
        } catch (error) {
            console.error("Error fetching athletes:", error);
            setError("Failed to load athletes. Please try again.");
        } finally {
            setDataLoading(false);
        }
    };

    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        } else if (user) {
            fetchAthletes();
        }
    }, [user, loading, router]);

    const retryFetch = () => {
        setDataLoading(true);
        setError(null);
        fetchAthletes();
    };

    if (loading || dataLoading) {
        return <AthleteDashboardSkeleton />;
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
                <div className="bg-white p-8 rounded-2xl border border-red-200 shadow-sm max-w-md text-center">
                    <div className="text-red-500 mb-4 text-4xl">⚠️</div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button
                        onClick={retryFetch}
                        className="bg-[#0071e3] text-white px-6 py-2 rounded-full font-bold hover:bg-[#0077ed] hover:scale-105 active:scale-95 transition-all duration-200"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f] animate-fadeIn">
            {/* Navbar */}
            <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100 px-4 sm:px-6 py-4 flex justify-between items-center transition-all duration-200">
                <div className="font-extrabold tracking-widest text-sm sm:text-base md:text-lg">GODSPEED<span className="text-[#0071e3]">PORTAL</span></div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push("/settings")}
                        className="p-2 text-gray-500 hover:text-black hover:bg-gray-100 rounded-full transition-all duration-200 hover:scale-105"
                        title="Settings"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                    <button
                        onClick={logout}
                        disabled={loggingOut}
                        className="text-sm font-semibold text-gray-500 hover:text-black disabled:text-gray-300 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2"
                    >
                        {loggingOut ? (
                            <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                LOGGING OUT...
                            </>
                        ) : (
                            "LOG OUT"
                        )}
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-5xl">
                <header className="mb-8 sm:mb-12">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                        <div>
                            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold uppercase tracking-tight mb-2">Welcome, <span className="text-[#0071e3]">Parent</span></h1>
                            <p className="text-sm sm:text-base text-gray-500">Manage your athlete's performance and schedule.</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={() => router.push("/stats")}
                                className="bg-[#0071e3] text-white px-5 py-2.5 rounded-full font-bold text-sm hover:bg-[#005bb5] hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                STATS
                            </button>
                            <button
                                onClick={() => router.push("/schedule")}
                                className="bg-white text-[#0071e3] border-2 border-[#0071e3] px-5 py-2.5 rounded-full font-bold text-sm hover:bg-[#0071e3] hover:text-white hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                SCHEDULE
                            </button>
                            <button
                                onClick={() => router.push("/messages")}
                                className="bg-white text-[#0071e3] border-2 border-[#0071e3] px-5 py-2.5 rounded-full font-bold text-sm hover:bg-[#0071e3] hover:text-white hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                MESSAGES
                            </button>
                            <button
                                onClick={() => router.push("/media")}
                                className="bg-white text-[#0071e3] border-2 border-[#0071e3] px-5 py-2.5 rounded-full font-bold text-sm hover:bg-[#0071e3] hover:text-white hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                MEDIA
                            </button>
                            <button
                                onClick={() => router.push("/payments")}
                                className="bg-white text-[#0071e3] border-2 border-[#0071e3] px-5 py-2.5 rounded-full font-bold text-sm hover:bg-[#0071e3] hover:text-white hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                </svg>
                                PAYMENTS
                            </button>
                        </div>
                    </div>
                </header>

                <section>
                    <h3 className="text-lg sm:text-xl font-bold uppercase mb-4 sm:mb-6 tracking-wide text-gray-800">Your Athletes</h3>

                    {athletes.length === 0 ? (
                        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 text-center shadow-sm animate-slideUp">
                            <div className="text-gray-300 text-6xl mb-4 animate-bounce">👤</div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">No Athletes Yet</h3>
                            <p className="text-gray-500 mb-4">No athletes are linked to this account. Contact your coach to get started.</p>
                        </div>
                    ) : (
                        <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                            {athletes.map((athlete, index) => (
                                <div
                                    key={athlete.id}
                                    className="flex flex-col gap-4 sm:gap-6 animate-slideUp"
                                    style={{ animationDelay: `${index * 100}ms` }}
                                >
                                    {/* Standard Info Card */}
                                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="text-xl sm:text-2xl font-bold uppercase group-hover:text-[#0071e3] transition-colors">{athlete.name}</h4>
                                                <p className="text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-wide">{athlete.team}</p>
                                                {athlete.position && (
                                                    <p className="text-xs text-gray-400 mt-2">Position: {athlete.position}</p>
                                                )}
                                            </div>
                                            <div className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full uppercase">Active</div>
                                        </div>
                                    </div>

                                    {/* Digital Trading Card */}
                                    <div className="flex justify-center">
                                        <AthleteTradingCard
                                            name={athlete.name}
                                            team={athlete.team}
                                            number={athlete.number || "00"}
                                            position={athlete.position || "ATH"}
                                            height={athlete.height || "N/A"}
                                            gradYear={athlete.gradYear || "20??"}
                                            photoUrl={athlete.photoUrl}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
