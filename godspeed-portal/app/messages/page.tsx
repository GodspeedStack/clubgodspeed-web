"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import { Send, MessageCircle, User, Clock, Search } from "lucide-react";
import { useToast } from "@/app/context/ToastContext";

interface Message {
    id: string;
    from: "coach" | "parent";
    fromName: string;
    content: string;
    timestamp: Date;
    read: boolean;
}

interface Conversation {
    id: string;
    coachName: string;
    lastMessage: string;
    lastMessageTime: Date;
    unreadCount: number;
    messages: Message[];
}

export default function MessagesPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const toast = useToast();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
    const [newMessage, setNewMessage] = useState("");
    const [dataLoading, setDataLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        } else if (user) {
            // Simulate loading conversations - In production, fetch from Firestore
            setTimeout(() => {
                const mockConversations: Conversation[] = [
                    {
                        id: "1",
                        coachName: "Coach Johnson",
                        lastMessage: "Great progress at practice today!",
                        lastMessageTime: new Date(2026, 0, 8, 16, 30),
                        unreadCount: 2,
                        messages: [
                            {
                                id: "m1",
                                from: "parent",
                                fromName: "Parent",
                                content: "Hi Coach, how is my son doing?",
                                timestamp: new Date(2026, 0, 7, 14, 0),
                                read: true,
                            },
                            {
                                id: "m2",
                                from: "coach",
                                fromName: "Coach Johnson",
                                content: "He's doing really well! His shooting has improved significantly.",
                                timestamp: new Date(2026, 0, 7, 15, 30),
                                read: true,
                            },
                            {
                                id: "m3",
                                from: "coach",
                                fromName: "Coach Johnson",
                                content: "Great progress at practice today!",
                                timestamp: new Date(2026, 0, 8, 16, 30),
                                read: false,
                            },
                        ],
                    },
                    {
                        id: "2",
                        coachName: "Coach Davis",
                        lastMessage: "Tournament schedule attached",
                        lastMessageTime: new Date(2026, 0, 5, 10, 0),
                        unreadCount: 0,
                        messages: [
                            {
                                id: "m4",
                                from: "coach",
                                fromName: "Coach Davis",
                                content: "Tournament schedule attached",
                                timestamp: new Date(2026, 0, 5, 10, 0),
                                read: true,
                            },
                        ],
                    },
                ];
                setConversations(mockConversations);
                setSelectedConversation(mockConversations[0]);
                setDataLoading(false);
            }, 800);
        }
    }, [user, loading, router]);

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedConversation || isSending) return;

        setIsSending(true);

        // Simulate sending message
        setTimeout(() => {
            const message: Message = {
                id: `m${Date.now()}`,
                from: "parent",
                fromName: "Parent",
                content: newMessage,
                timestamp: new Date(),
                read: true,
            };

            const updatedConversation = {
                ...selectedConversation,
                messages: [...selectedConversation.messages, message],
                lastMessage: newMessage,
                lastMessageTime: new Date(),
            };

            setSelectedConversation(updatedConversation);
            setConversations(
                conversations.map((conv) => (conv.id === selectedConversation.id ? updatedConversation : conv))
            );
            setNewMessage("");
            toast.success("Message sent!");
            setIsSending(false);
        }, 500);
    };

    const filteredConversations = conversations.filter((conv) =>
        conv.coachName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading || dataLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
                <div className="animate-pulse text-[#0071e3] font-bold text-xl">Loading Messages...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f] animate-fadeIn">
            {/* Navbar */}
            <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100 px-4 sm:px-6 py-4 flex justify-between items-center">
                <div className="font-extrabold tracking-widest text-sm sm:text-base md:text-lg">
                    GODSPEED<span className="text-[#0071e3]">MESSAGES</span>
                </div>
                <button
                    onClick={() => router.push("/dashboard")}
                    className="text-sm font-semibold text-gray-500 hover:text-black transition-all duration-200 hover:scale-105"
                >
                    ← BACK
                </button>
            </nav>

            {/* Main Content */}
            <main className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-7xl">
                {/* Header */}
                <header className="mb-8 sm:mb-12">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold uppercase tracking-tight mb-2">
                        Coach <span className="text-[#0071e3]">Messages</span>
                    </h1>
                    <p className="text-sm sm:text-base text-gray-500">Communicate directly with your athlete's coaches</p>
                </header>

                {/* Messages Interface */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 h-[600px]">
                    {/* Conversations List */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col animate-slideUp">
                        {/* Search */}
                        <div className="p-4 border-b border-gray-100">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search coaches..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3] focus:ring-opacity-20"
                                />
                            </div>
                        </div>

                        {/* Conversation List */}
                        <div className="flex-1 overflow-y-auto">
                            {filteredConversations.length === 0 ? (
                                <div className="text-center py-12">
                                    <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 text-sm">No conversations found</p>
                                </div>
                            ) : (
                                filteredConversations.map((conv) => (
                                    <div
                                        key={conv.id}
                                        onClick={() => setSelectedConversation(conv)}
                                        className={`p-4 border-b border-gray-100 cursor-pointer transition-all duration-200 hover:bg-blue-50 ${
                                            selectedConversation?.id === conv.id ? "bg-blue-50 border-l-4 border-l-[#0071e3]" : ""
                                        }`}
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <h3 className="font-bold text-gray-900 text-sm">{conv.coachName}</h3>
                                            {conv.unreadCount > 0 && (
                                                <span className="bg-[#0071e3] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                                    {conv.unreadCount}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-600 truncate mb-1">{conv.lastMessage}</p>
                                        <div className="flex items-center gap-1 text-xs text-gray-400">
                                            <Clock className="w-3 h-3" />
                                            {conv.lastMessageTime.toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                hour: "numeric",
                                                minute: "2-digit",
                                            })}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Chat Window */}
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col animate-slideUp" style={{ animationDelay: "100ms" }}>
                        {selectedConversation ? (
                            <>
                                {/* Chat Header */}
                                <div className="p-4 border-b border-gray-100 bg-gray-50">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-[#0071e3] rounded-full">
                                            <User className="w-5 h-5 text-white" />
                                        </div>
                                        <div>
                                            <h2 className="font-bold text-gray-900">{selectedConversation.coachName}</h2>
                                            <p className="text-xs text-gray-500">Head Coach</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Messages */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {selectedConversation.messages.map((message) => (
                                        <div
                                            key={message.id}
                                            className={`flex ${message.from === "parent" ? "justify-end" : "justify-start"}`}
                                        >
                                            <div
                                                className={`max-w-[70%] p-3 rounded-2xl ${
                                                    message.from === "parent"
                                                        ? "bg-[#0071e3] text-white"
                                                        : "bg-gray-100 text-gray-900"
                                                }`}
                                            >
                                                <p className="text-sm">{message.content}</p>
                                                <p
                                                    className={`text-xs mt-1 ${
                                                        message.from === "parent" ? "text-blue-100" : "text-gray-500"
                                                    }`}
                                                >
                                                    {message.timestamp.toLocaleTimeString("en-US", {
                                                        hour: "numeric",
                                                        minute: "2-digit",
                                                    })}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Message Input */}
                                <div className="p-4 border-t border-gray-100 bg-gray-50">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="text"
                                            placeholder="Type a message..."
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                                            disabled={isSending}
                                            className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-full text-sm focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3] focus:ring-opacity-20 disabled:bg-gray-100"
                                        />
                                        <button
                                            onClick={handleSendMessage}
                                            disabled={!newMessage.trim() || isSending}
                                            className="p-3 bg-[#0071e3] text-white rounded-full hover:bg-[#005bb5] disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 active:scale-95"
                                        >
                                            <Send className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center">
                                    <MessageCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                    <p className="text-gray-500">Select a conversation to start messaging</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
