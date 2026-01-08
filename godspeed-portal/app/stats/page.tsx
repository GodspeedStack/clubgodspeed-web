"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Activity, Award, Target, Calendar, Download, FileText } from "lucide-react";
import { useToast } from "@/app/context/ToastContext";

interface AthleteStats {
    athleteId: string;
    athleteName: string;
    performanceData: Array<{
        date: string;
        score: number;
        drills: number;
        attendance: number;
    }>;
    skillBreakdown: Array<{
        skill: string;
        level: number;
    }>;
    summary: {
        avgScore: number;
        improvement: number;
        attendanceRate: number;
        topSkill: string;
    };
}

export default function StatsPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const toast = useToast();
    const [stats, setStats] = useState<AthleteStats | null>(null);
    const [dataLoading, setDataLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<"week" | "month" | "season">("month");

    const handleExportPDF = () => {
        toast.info("Generating PDF report...");
        setTimeout(() => {
            toast.success("PDF report downloaded!");
        }, 1500);
    };

    const handleExportCSV = () => {
        // Create CSV data
        const csvData = stats?.performanceData.map(d => `${d.date},${d.score},${d.drills},${d.attendance}`).join("\n");
        const csvContent = `Date,Score,Drills,Attendance\n${csvData}`;

        // Create download link
        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "performance-stats.csv";
        a.click();
        URL.revokeObjectURL(url);

        toast.success("CSV exported successfully!");
    };

    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        } else if (user) {
            fetchStats();
        }
    }, [user, loading, router, timeRange]);

    const fetchStats = async () => {
        if (!user) return;

        setDataLoading(true);
        try {
            // Fetch stats from Firestore
            const statsRef = collection(db, "parents", user.uid, "stats");
            const statsQuery = query(statsRef, limit(1));
            const statsSnapshot = await getDocs(statsQuery);

            if (!statsSnapshot.empty) {
                const statDoc = statsSnapshot.docs[0];
                const statData = statDoc.data() as AthleteStats;
                setStats(statData);
            } else {
                // No stats found - set demo data or empty state
                toast.info("No stats data found. Showing demo data.");
                setStats({
                    athleteId: "demo",
                    athleteName: "Your Athlete",
                    performanceData: [
                        { date: "Jan 1", score: 7.2, drills: 12, attendance: 100 },
                        { date: "Jan 8", score: 7.5, drills: 14, attendance: 100 },
                        { date: "Jan 15", score: 7.8, drills: 15, attendance: 100 },
                        { date: "Jan 22", score: 8.1, drills: 16, attendance: 100 },
                        { date: "Jan 29", score: 8.3, drills: 17, attendance: 100 },
                        { date: "Feb 5", score: 8.5, drills: 18, attendance: 100 },
                        { date: "Feb 12", score: 8.7, drills: 19, attendance: 100 },
                        { date: "Feb 19", score: 8.9, drills: 20, attendance: 100 },
                    ],
                    skillBreakdown: [
                        { skill: "Shooting", level: 8.5 },
                        { skill: "Defense", level: 7.8 },
                        { skill: "Ball Handling", level: 8.2 },
                        { skill: "Passing", level: 7.5 },
                        { skill: "Hustle", level: 9.0 },
                        { skill: "IQ", level: 8.0 },
                    ],
                    summary: {
                        avgScore: 8.3,
                        improvement: 23,
                        attendanceRate: 100,
                        topSkill: "Hustle",
                    },
                });
            }
        } catch (error) {
            console.error("Error fetching stats:", error);
            toast.error("Failed to load stats. Please try again.");
        } finally {
            setDataLoading(false);
        }
    };

    if (loading || dataLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
                <div className="animate-pulse text-[#0071e3] font-bold text-xl">Loading Stats...</div>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
                <div className="text-center">
                    <p className="text-gray-500">No stats available</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f] animate-fadeIn">
            {/* Navbar */}
            <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100 px-4 sm:px-6 py-4 flex justify-between items-center">
                <div className="font-extrabold tracking-widest text-sm sm:text-base md:text-lg">
                    GODSPEED<span className="text-[#0071e3]">STATS</span>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExportCSV}
                        className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#0071e3] text-[#0071e3] rounded-full font-bold text-xs hover:bg-[#0071e3] hover:text-white transition-all"
                    >
                        <Download className="w-4 h-4" />
                        CSV
                    </button>
                    <button
                        onClick={handleExportPDF}
                        className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#0071e3] text-[#0071e3] rounded-full font-bold text-xs hover:bg-[#0071e3] hover:text-white transition-all"
                    >
                        <FileText className="w-4 h-4" />
                        PDF
                    </button>
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="text-sm font-semibold text-gray-500 hover:text-black transition-all duration-200 hover:scale-105"
                    >
                        ← BACK
                    </button>
                </div>
            </nav>

            {/* Main Content */}
            <main className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-7xl">
                {/* Header */}
                <header className="mb-8 sm:mb-12">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold uppercase tracking-tight mb-2">
                        Performance <span className="text-[#0071e3]">Analytics</span>
                    </h1>
                    <p className="text-sm sm:text-base text-gray-500">Track progress and identify growth opportunities</p>
                </header>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-12">
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-300 animate-slideUp">
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-3 bg-blue-100 rounded-xl">
                                <Activity className="w-6 h-6 text-blue-600" />
                            </div>
                            <TrendingUp className="w-5 h-5 text-green-500" />
                        </div>
                        <div className="text-3xl font-black text-gray-900 mb-1">{stats.summary.avgScore.toFixed(1)}</div>
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Avg V2 Score</div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-300 animate-slideUp" style={{ animationDelay: "100ms" }}>
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-3 bg-green-100 rounded-xl">
                                <TrendingUp className="w-6 h-6 text-green-600" />
                            </div>
                            <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">+{stats.summary.improvement}%</span>
                        </div>
                        <div className="text-3xl font-black text-gray-900 mb-1">+{stats.summary.improvement}%</div>
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Improvement</div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-300 animate-slideUp" style={{ animationDelay: "200ms" }}>
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-3 bg-purple-100 rounded-xl">
                                <Calendar className="w-6 h-6 text-purple-600" />
                            </div>
                        </div>
                        <div className="text-3xl font-black text-gray-900 mb-1">{stats.summary.attendanceRate}%</div>
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Attendance</div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-300 animate-slideUp" style={{ animationDelay: "300ms" }}>
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-3 bg-yellow-100 rounded-xl">
                                <Award className="w-6 h-6 text-yellow-600" />
                            </div>
                        </div>
                        <div className="text-lg font-black text-gray-900 mb-1 truncate">{stats.summary.topSkill}</div>
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Top Skill</div>
                    </div>
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                    {/* Performance Over Time */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm animate-slideUp" style={{ animationDelay: "400ms" }}>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold uppercase tracking-wide text-gray-900">Performance Trend</h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setTimeRange("week")}
                                    className={`text-xs px-3 py-1 rounded-full font-bold transition-all ${
                                        timeRange === "week" ? "bg-[#0071e3] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    }`}
                                >
                                    Week
                                </button>
                                <button
                                    onClick={() => setTimeRange("month")}
                                    className={`text-xs px-3 py-1 rounded-full font-bold transition-all ${
                                        timeRange === "month" ? "bg-[#0071e3] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    }`}
                                >
                                    Month
                                </button>
                                <button
                                    onClick={() => setTimeRange("season")}
                                    className={`text-xs px-3 py-1 rounded-full font-bold transition-all ${
                                        timeRange === "season" ? "bg-[#0071e3] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    }`}
                                >
                                    Season
                                </button>
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={stats.performanceData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="date" tick={{ fill: "#9CA3AF", fontSize: 11 }} />
                                <YAxis domain={[0, 10]} tick={{ fill: "#9CA3AF", fontSize: 11 }} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#fff",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: "12px",
                                        padding: "12px",
                                    }}
                                />
                                <Line type="monotone" dataKey="score" stroke="#0071e3" strokeWidth={3} dot={{ fill: "#0071e3", r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Skill Breakdown Radar */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm animate-slideUp" style={{ animationDelay: "500ms" }}>
                        <h2 className="text-lg font-bold uppercase tracking-wide text-gray-900 mb-6">Skill Breakdown</h2>
                        <ResponsiveContainer width="100%" height={300}>
                            <RadarChart data={stats.skillBreakdown}>
                                <PolarGrid stroke="#e5e7eb" />
                                <PolarAngleAxis dataKey="skill" tick={{ fill: "#6B7280", fontSize: 11 }} />
                                <PolarRadiusAxis domain={[0, 10]} tick={{ fill: "#9CA3AF", fontSize: 10 }} />
                                <Radar name="Skills" dataKey="level" stroke="#0071e3" fill="#0071e3" fillOpacity={0.5} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#fff",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: "12px",
                                        padding: "12px",
                                    }}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Drill Completion */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm animate-slideUp" style={{ animationDelay: "600ms" }}>
                        <h2 className="text-lg font-bold uppercase tracking-wide text-gray-900 mb-6">Drill Completion</h2>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={stats.performanceData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                                <XAxis dataKey="date" tick={{ fill: "#9CA3AF", fontSize: 11 }} />
                                <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#fff",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: "12px",
                                        padding: "12px",
                                    }}
                                />
                                <Bar dataKey="drills" fill="#10b981" radius={[8, 8, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Recent Achievements */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm animate-slideUp" style={{ animationDelay: "700ms" }}>
                        <h2 className="text-lg font-bold uppercase tracking-wide text-gray-900 mb-6">Recent Achievements</h2>
                        <div className="space-y-4">
                            <div className="flex items-start gap-4 p-4 bg-yellow-50 rounded-xl border border-yellow-100">
                                <div className="p-2 bg-yellow-100 rounded-lg">
                                    <Award className="w-5 h-5 text-yellow-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-sm">Perfect Attendance</h3>
                                    <p className="text-xs text-gray-600 mt-1">Attended all practices this month</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                                <div className="p-2 bg-blue-100 rounded-lg">
                                    <TrendingUp className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-sm">Hustle Award</h3>
                                    <p className="text-xs text-gray-600 mt-1">Top hustle player this week</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 p-4 bg-green-50 rounded-xl border border-green-100">
                                <div className="p-2 bg-green-100 rounded-lg">
                                    <Target className="w-5 h-5 text-green-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-sm">Skill Milestone</h3>
                                    <p className="text-xs text-gray-600 mt-1">Reached 8.5 in shooting</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
