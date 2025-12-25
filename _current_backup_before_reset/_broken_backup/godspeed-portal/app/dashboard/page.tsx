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
    number?: string;    // Add optional fields
    position?: string;
    height?: string;
    gradYear?: string;
    [key: string]: any;
}

export default function DashboardPage() {
    const { user, loading, logout } = useAuth();
    const router = useRouter();
    const [athletes, setAthletes] = useState<Athlete[]>([]);
    const [dataLoading, setDataLoading] = useState(true);

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
                } catch (error) {
                    console.error("Error fetching athletes:", error);
                } finally {
                    setDataLoading(false);
                }
            };
            fetchAthletes();
        }
    }, [user, loading, router]);

    if (loading || dataLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
                <div className="animate-pulse text-[#0071e3] font-bold text-xl">Loading Front Office...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f]">
            {/* Navbar */}
            <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100 px-6 py-4 flex justify-between items-center">
                <div className="font-extrabold tracking-widest text-lg">GODSPEED<span className="text-[#0071e3]">PORTAL</span></div>
                <button onClick={logout} className="text-sm font-semibold text-gray-500 hover:text-black transition-colors">
                    LOG OUT
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
                            <p className="text-gray-400 mb-4">No athletes linked to this account yet.</p>
                            <button className="bg-[#111] text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-black transition-colors">
                                Add Athlete
                            </button>
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-8">
                            {athletes.map((athlete) => (
                                <div key={athlete.id} className="flex flex-col gap-6">
                                    {/* Standard Info Card */}
                                    <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow group">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h4 className="text-2xl font-bold uppercase group-hover:text-[#0071e3] transition-colors">{athlete.name}</h4>
                                                <p className="text-sm text-gray-500 font-medium uppercase tracking-wide">{athlete.team}</p>
                                            </div>
                                            <div className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full uppercase">Active</div>
                                        </div>

                                        <div className="flex gap-4 mt-6">
                                            <button className="flex-1 bg-gray-50 border border-gray-200 py-2 rounded-xl text-sm font-semibold hover:bg-gray-100 transition-colors">
                                                Stats
                                            </button>
                                            <button className="flex-1 bg-gray-50 border border-gray-200 py-2 rounded-xl text-sm font-semibold hover:bg-gray-100 transition-colors">
                                                Schedule
                                            </button>
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
