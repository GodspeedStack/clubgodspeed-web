"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import AthleteTradingCard from "@/app/components/AthleteTradingCard";

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

    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        } else if (user) {
            const fetchAthletes = async () => {
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
            fetchAthletes();
        }
    }, [user, loading, router]);

    const retryFetch = () => {
        setDataLoading(true);
        setError(null);
        if (user) {
            const fetchAthletes = async () => {
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
            fetchAthletes();
        }
    };

    if (loading || dataLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
                <div className="text-center">
                    <div className="animate-pulse text-[#0071e3] font-bold text-xl mb-2">Loading Dashboard...</div>
                    <p className="text-gray-500 text-sm">Fetching your athlete data</p>
                </div>
            </div>
        );
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
                        className="bg-[#0071e3] text-white px-6 py-2 rounded-full font-bold hover:bg-[#0077ed] transition-colors"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f]">
            {/* Navbar */}
            <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100 px-6 py-4 flex justify-between items-center">
                <div className="font-extrabold tracking-widest text-lg">GODSPEED<span className="text-[#0071e3]">PORTAL</span></div>
                <button
                    onClick={logout}
                    disabled={loggingOut}
                    className="text-sm font-semibold text-gray-500 hover:text-black disabled:text-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
            </nav>

            {/* Main Content */}
            <main className="container mx-auto px-6 py-12 max-w-5xl">
                <header className="mb-12">
                    <h1 className="text-4xl font-extrabold uppercase tracking-tight mb-2">Welcome, <span className="text-[#0071e3]">Parent</span></h1>
                    <p className="text-gray-500">Manage your athlete's performance and schedule.</p>
                </header>

                <section>
                    <h3 className="text-xl font-bold uppercase mb-6 tracking-wide text-gray-800">Your Athletes</h3>

                    {athletes.length === 0 ? (
                        <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center shadow-sm">
                            <div className="text-gray-300 text-6xl mb-4">👤</div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">No Athletes Yet</h3>
                            <p className="text-gray-500 mb-4">No athletes are linked to this account. Contact your coach to get started.</p>
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-8">
                            {athletes.map((athlete) => (
                                <div key={athlete.id} className="flex flex-col gap-6">
                                    {/* Standard Info Card */}
                                    <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow group">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="text-2xl font-bold uppercase group-hover:text-[#0071e3] transition-colors">{athlete.name}</h4>
                                                <p className="text-sm text-gray-500 font-medium uppercase tracking-wide">{athlete.team}</p>
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
                                            number={athlete.number || "00"} // Default or fetch from DB
                                            position={athlete.position || "ATH"}
                                            height={athlete.height || "N/A"}
                                            gradYear={athlete.gradYear || "20??"}
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
