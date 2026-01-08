"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy, Timestamp } from "firebase/firestore";
import { Calendar as CalendarIcon, MapPin, Clock, Users, Trophy, Dumbbell, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useToast } from "@/app/context/ToastContext";

interface ScheduleEvent {
    id: string;
    title: string;
    type: "practice" | "game" | "tournament";
    date: Date;
    time: string;
    location: string;
    description?: string;
    status: "upcoming" | "completed" | "cancelled";
}

export default function SchedulePage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const toast = useToast();
    const [events, setEvents] = useState<ScheduleEvent[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [filterType, setFilterType] = useState<"all" | "practice" | "game" | "tournament">("all");

    const handleExportCSV = () => {
        // Create CSV data
        const csvData = events.map(e =>
            `"${e.title}","${e.type}","${e.date.toLocaleDateString()}","${e.time}","${e.location}","${e.status}"`
        ).join("\n");
        const csvContent = `Title,Type,Date,Time,Location,Status\n${csvData}`;

        // Create download link
        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "team-schedule.csv";
        a.click();
        URL.revokeObjectURL(url);

        toast.success("Schedule exported to CSV!");
    };

    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        } else if (user) {
            fetchEvents();
        }
    }, [user, loading, router]);

    const fetchEvents = async () => {
        if (!user) return;

        setDataLoading(true);
        try {
            // Fetch events from Firestore
            const eventsRef = collection(db, "parents", user.uid, "events");
            const eventsQuery = query(eventsRef, orderBy("date", "asc"));
            const eventsSnapshot = await getDocs(eventsQuery);

            if (!eventsSnapshot.empty) {
                const eventsList: ScheduleEvent[] = eventsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        date: data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date),
                    } as ScheduleEvent;
                });
                setEvents(eventsList);
            } else {
                // No events found - set demo data
                toast.info("No events found. Showing demo schedule.");
                const mockEvents: ScheduleEvent[] = [
                    {
                        id: "1",
                        title: "Team Practice",
                        type: "practice",
                        date: new Date(2026, 0, 10),
                        time: "4:00 PM - 6:00 PM",
                        location: "Main Gym",
                        description: "Regular team practice - Focus on defensive drills",
                        status: "upcoming",
                    },
                    {
                        id: "2",
                        title: "vs Thunder",
                        type: "game",
                        date: new Date(2026, 0, 12),
                        time: "7:00 PM",
                        location: "Lincoln High School",
                        description: "League game",
                        status: "upcoming",
                    },
                    {
                        id: "3",
                        title: "Shooting Practice",
                        type: "practice",
                        date: new Date(2026, 0, 15),
                        time: "5:30 PM - 7:00 PM",
                        location: "Main Gym",
                        description: "Advanced shooting drills",
                        status: "upcoming",
                    },
                    {
                        id: "4",
                        title: "MLK Tournament",
                        type: "tournament",
                        date: new Date(2026, 0, 18),
                        time: "All Day",
                        location: "Convention Center",
                        description: "3-day tournament - Check in at 8:00 AM",
                        status: "upcoming",
                    },
                    {
                        id: "5",
                        title: "vs Eagles",
                        type: "game",
                        date: new Date(2026, 0, 20),
                        time: "6:00 PM",
                        location: "Home Court",
                        description: "Home game",
                        status: "upcoming",
                    },
                ];
                setEvents(mockEvents);
            }
        } catch (error) {
            console.error("Error fetching events:", error);
            toast.error("Failed to load schedule. Please try again.");
        } finally {
            setDataLoading(false);
        }
    };

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        return { daysInMonth, startingDayOfWeek };
    };

    const getEventsForDate = (date: Date) => {
        return events.filter((event) => {
            return (
                event.date.getDate() === date.getDate() &&
                event.date.getMonth() === date.getMonth() &&
                event.date.getFullYear() === date.getFullYear() &&
                (filterType === "all" || event.type === filterType)
            );
        });
    };

    const nextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
    };

    const prevMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
    };

    const renderCalendar = () => {
        const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentMonth);
        const weeks = [];
        let days = [];

        // Empty cells for days before month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(<div key={`empty-${i}`} className="aspect-square" />);
        }

        // Days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            const dayEvents = getEventsForDate(date);
            const isToday =
                date.getDate() === new Date().getDate() &&
                date.getMonth() === new Date().getMonth() &&
                date.getFullYear() === new Date().getFullYear();

            days.push(
                <div
                    key={day}
                    onClick={() => setSelectedDate(date)}
                    className={`aspect-square p-1 sm:p-2 border border-gray-100 cursor-pointer transition-all duration-200 hover:bg-blue-50 ${
                        isToday ? "bg-blue-100 border-blue-300" : "bg-white"
                    } ${
                        selectedDate &&
                        selectedDate.getDate() === date.getDate() &&
                        selectedDate.getMonth() === date.getMonth()
                            ? "ring-2 ring-[#0071e3]"
                            : ""
                    }`}
                >
                    <div className="text-xs sm:text-sm font-bold text-gray-900">{day}</div>
                    <div className="mt-1 space-y-1">
                        {dayEvents.slice(0, 2).map((event) => (
                            <div
                                key={event.id}
                                className={`text-[8px] sm:text-[10px] px-1 py-0.5 rounded font-bold truncate ${
                                    event.type === "game"
                                        ? "bg-blue-100 text-blue-700"
                                        : event.type === "tournament"
                                        ? "bg-yellow-100 text-yellow-700"
                                        : "bg-green-100 text-green-700"
                                }`}
                            >
                                {event.title}
                            </div>
                        ))}
                        {dayEvents.length > 2 && (
                            <div className="text-[8px] text-gray-500 font-bold">+{dayEvents.length - 2} more</div>
                        )}
                    </div>
                </div>
            );

            if ((startingDayOfWeek + day) % 7 === 0) {
                weeks.push(
                    <div key={`week-${weeks.length}`} className="grid grid-cols-7 gap-1">
                        {days}
                    </div>
                );
                days = [];
            }
        }

        // Add remaining days
        if (days.length > 0) {
            while (days.length < 7) {
                days.push(<div key={`empty-end-${days.length}`} className="aspect-square" />);
            }
            weeks.push(
                <div key={`week-${weeks.length}`} className="grid grid-cols-7 gap-1">
                    {days}
                </div>
            );
        }

        return weeks;
    };

    const upcomingEvents = events
        .filter((e) => e.status === "upcoming" && (filterType === "all" || e.type === filterType))
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, 5);

    if (loading || dataLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
                <div className="animate-pulse text-[#0071e3] font-bold text-xl">Loading Schedule...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f] animate-fadeIn">
            {/* Navbar */}
            <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100 px-4 sm:px-6 py-4 flex justify-between items-center">
                <div className="font-extrabold tracking-widest text-sm sm:text-base md:text-lg">
                    GODSPEED<span className="text-[#0071e3]">SCHEDULE</span>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExportCSV}
                        className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#0071e3] text-[#0071e3] rounded-full font-bold text-xs hover:bg-[#0071e3] hover:text-white transition-all"
                    >
                        <Download className="w-4 h-4" />
                        EXPORT CSV
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
                        Team <span className="text-[#0071e3]">Schedule</span>
                    </h1>
                    <p className="text-sm sm:text-base text-gray-500">View practices, games, and tournaments</p>
                </header>

                {/* Filter Buttons */}
                <div className="flex flex-wrap gap-2 mb-6">
                    <button
                        onClick={() => setFilterType("all")}
                        className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${
                            filterType === "all"
                                ? "bg-[#0071e3] text-white shadow-lg"
                                : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                    >
                        All Events
                    </button>
                    <button
                        onClick={() => setFilterType("practice")}
                        className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${
                            filterType === "practice"
                                ? "bg-green-500 text-white shadow-lg"
                                : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                    >
                        <Dumbbell className="w-4 h-4 inline mr-1" />
                        Practices
                    </button>
                    <button
                        onClick={() => setFilterType("game")}
                        className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${
                            filterType === "game"
                                ? "bg-blue-500 text-white shadow-lg"
                                : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                    >
                        <Users className="w-4 h-4 inline mr-1" />
                        Games
                    </button>
                    <button
                        onClick={() => setFilterType("tournament")}
                        className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${
                            filterType === "tournament"
                                ? "bg-yellow-500 text-white shadow-lg"
                                : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                    >
                        <Trophy className="w-4 h-4 inline mr-1" />
                        Tournaments
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                    {/* Calendar */}
                    <div className="lg:col-span-2 bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-sm animate-slideUp">
                        {/* Calendar Header */}
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-900">
                                {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                            </h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={prevMonth}
                                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={nextMonth}
                                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Day Labels */}
                        <div className="grid grid-cols-7 gap-1 mb-2">
                            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                                <div key={day} className="text-center text-xs font-bold text-gray-500 py-2">
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Calendar Grid */}
                        <div className="space-y-1">{renderCalendar()}</div>
                    </div>

                    {/* Upcoming Events */}
                    <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 shadow-sm animate-slideUp" style={{ animationDelay: "100ms" }}>
                        <h2 className="text-lg font-bold uppercase tracking-wide text-gray-900 mb-6">Upcoming Events</h2>
                        <div className="space-y-4">
                            {upcomingEvents.length === 0 ? (
                                <div className="text-center py-8">
                                    <CalendarIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 text-sm">No upcoming events</p>
                                </div>
                            ) : (
                                upcomingEvents.map((event) => (
                                    <div
                                        key={event.id}
                                        className={`p-4 rounded-xl border-l-4 transition-all duration-200 hover:shadow-md ${
                                            event.type === "game"
                                                ? "bg-blue-50 border-blue-500"
                                                : event.type === "tournament"
                                                ? "bg-yellow-50 border-yellow-500"
                                                : "bg-green-50 border-green-500"
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div
                                                className={`p-2 rounded-lg ${
                                                    event.type === "game"
                                                        ? "bg-blue-100"
                                                        : event.type === "tournament"
                                                        ? "bg-yellow-100"
                                                        : "bg-green-100"
                                                }`}
                                            >
                                                {event.type === "game" ? (
                                                    <Users className="w-4 h-4 text-blue-600" />
                                                ) : event.type === "tournament" ? (
                                                    <Trophy className="w-4 h-4 text-yellow-600" />
                                                ) : (
                                                    <Dumbbell className="w-4 h-4 text-green-600" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold text-gray-900 text-sm truncate">{event.title}</h3>
                                                <div className="flex items-center gap-1 mt-1 text-xs text-gray-600">
                                                    <CalendarIcon className="w-3 h-3" />
                                                    {event.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                                </div>
                                                <div className="flex items-center gap-1 mt-1 text-xs text-gray-600">
                                                    <Clock className="w-3 h-3" />
                                                    {event.time}
                                                </div>
                                                <div className="flex items-center gap-1 mt-1 text-xs text-gray-600">
                                                    <MapPin className="w-3 h-3" />
                                                    {event.location}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
