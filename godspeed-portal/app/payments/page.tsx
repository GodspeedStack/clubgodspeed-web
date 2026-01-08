"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { useRouter } from "next/navigation";
import { CreditCard, DollarSign, Receipt, CheckCircle, Clock, AlertCircle, Download, ShoppingBag } from "lucide-react";
import { useToast } from "@/app/context/ToastContext";

interface Payment {
    id: string;
    description: string;
    amount: number;
    dueDate: Date;
    paidDate?: Date;
    status: "pending" | "paid" | "overdue";
    type: "membership" | "tournament" | "merchandise" | "other";
    receiptUrl?: string;
}

interface MerchandiseItem {
    id: string;
    name: string;
    price: number;
    image: string;
    category: "apparel" | "equipment";
}

export default function PaymentsPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const toast = useToast();

    const [payments, setPayments] = useState<Payment[]>([]);
    const [merchandise, setMerchandise] = useState<MerchandiseItem[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"dues" | "history" | "store">("dues");
    const [processingPayment, setProcessingPayment] = useState<string | null>(null);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        } else if (user) {
            // Simulate loading payments - In production, fetch from Firestore
            setTimeout(() => {
                const mockPayments: Payment[] = [
                    {
                        id: "1",
                        description: "Winter Season Membership",
                        amount: 250.00,
                        dueDate: new Date(2026, 0, 15),
                        status: "pending",
                        type: "membership",
                    },
                    {
                        id: "2",
                        description: "MLK Tournament Fee",
                        amount: 75.00,
                        dueDate: new Date(2026, 0, 10),
                        status: "pending",
                        type: "tournament",
                    },
                    {
                        id: "3",
                        description: "Fall Season Membership",
                        amount: 250.00,
                        dueDate: new Date(2025, 8, 1),
                        paidDate: new Date(2025, 7, 28),
                        status: "paid",
                        type: "membership",
                        receiptUrl: "#",
                    },
                    {
                        id: "4",
                        description: "Team Jersey",
                        amount: 45.00,
                        dueDate: new Date(2025, 7, 15),
                        paidDate: new Date(2025, 7, 14),
                        status: "paid",
                        type: "merchandise",
                        receiptUrl: "#",
                    },
                ];

                const mockMerchandise: MerchandiseItem[] = [
                    {
                        id: "m1",
                        name: "Team Jersey",
                        price: 45.00,
                        image: "https://via.placeholder.com/300x300?text=Team+Jersey",
                        category: "apparel",
                    },
                    {
                        id: "m2",
                        name: "Practice Shorts",
                        price: 28.00,
                        image: "https://via.placeholder.com/300x300?text=Practice+Shorts",
                        category: "apparel",
                    },
                    {
                        id: "m3",
                        name: "Team Hoodie",
                        price: 55.00,
                        image: "https://via.placeholder.com/300x300?text=Team+Hoodie",
                        category: "apparel",
                    },
                    {
                        id: "m4",
                        name: "Training Basketball",
                        price: 35.00,
                        image: "https://via.placeholder.com/300x300?text=Basketball",
                        category: "equipment",
                    },
                ];

                setPayments(mockPayments);
                setMerchandise(mockMerchandise);
                setDataLoading(false);
            }, 800);
        }
    }, [user, loading, router]);

    const handlePayment = async (paymentId: string) => {
        setProcessingPayment(paymentId);

        // Simulate Stripe payment - In production, use Stripe API
        setTimeout(() => {
            setPayments(payments.map(p =>
                p.id === paymentId
                    ? { ...p, status: "paid", paidDate: new Date(), receiptUrl: "#" }
                    : p
            ));
            setProcessingPayment(null);
            toast.success("Payment processed successfully!");
        }, 2000);
    };

    const handleMerchandisePurchase = async (itemId: string) => {
        toast.info("Redirecting to checkout...");
        // In production, integrate with Stripe Checkout
        setTimeout(() => {
            toast.success("Item added to cart!");
        }, 1000);
    };

    const pendingPayments = payments.filter(p => p.status === "pending" || p.status === "overdue");
    const paidPayments = payments.filter(p => p.status === "paid");
    const totalPending = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
    const totalPaid = paidPayments.reduce((sum, p) => sum + p.amount, 0);

    if (loading || dataLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
                <div className="animate-pulse text-[#0071e3] font-bold text-xl">Loading Payments...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f] animate-fadeIn">
            {/* Navbar */}
            <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100 px-4 sm:px-6 py-4 flex justify-between items-center">
                <div className="font-extrabold tracking-widest text-sm sm:text-base md:text-lg">
                    GODSPEED<span className="text-[#0071e3]">PAY</span>
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
                        Payments & <span className="text-[#0071e3]">Billing</span>
                    </h1>
                    <p className="text-sm sm:text-base text-gray-500">Manage fees, dues, and team merchandise</p>
                </header>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                    <div className="bg-gradient-to-br from-red-500 to-red-600 p-6 rounded-2xl shadow-lg text-white animate-slideUp">
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-3 bg-white/20 rounded-xl">
                                <AlertCircle className="w-6 h-6" />
                            </div>
                            <DollarSign className="w-8 h-8 opacity-50" />
                        </div>
                        <div className="text-3xl font-black mb-1">${totalPending.toFixed(2)}</div>
                        <div className="text-sm font-semibold opacity-90">Amount Due</div>
                        <div className="text-xs mt-2 opacity-75">{pendingPayments.length} pending payment(s)</div>
                    </div>

                    <div className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-2xl shadow-lg text-white animate-slideUp" style={{ animationDelay: "100ms" }}>
                        <div className="flex items-center justify-between mb-3">
                            <div className="p-3 bg-white/20 rounded-xl">
                                <CheckCircle className="w-6 h-6" />
                            </div>
                            <Receipt className="w-8 h-8 opacity-50" />
                        </div>
                        <div className="text-3xl font-black mb-1">${totalPaid.toFixed(2)}</div>
                        <div className="text-sm font-semibold opacity-90">Total Paid</div>
                        <div className="text-xs mt-2 opacity-75">{paidPayments.length} completed payment(s)</div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab("dues")}
                        className={`px-6 py-3 rounded-full font-bold text-sm transition-all whitespace-nowrap ${
                            activeTab === "dues"
                                ? "bg-[#0071e3] text-white shadow-lg"
                                : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                    >
                        <Clock className="w-4 h-4 inline mr-2" />
                        Upcoming Dues
                    </button>
                    <button
                        onClick={() => setActiveTab("history")}
                        className={`px-6 py-3 rounded-full font-bold text-sm transition-all whitespace-nowrap ${
                            activeTab === "history"
                                ? "bg-[#0071e3] text-white shadow-lg"
                                : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                    >
                        <Receipt className="w-4 h-4 inline mr-2" />
                        Payment History
                    </button>
                    <button
                        onClick={() => setActiveTab("store")}
                        className={`px-6 py-3 rounded-full font-bold text-sm transition-all whitespace-nowrap ${
                            activeTab === "store"
                                ? "bg-[#0071e3] text-white shadow-lg"
                                : "bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                    >
                        <ShoppingBag className="w-4 h-4 inline mr-2" />
                        Team Store
                    </button>
                </div>

                {/* Content */}
                {activeTab === "dues" && (
                    <div className="space-y-4 animate-slideUp">
                        {pendingPayments.length === 0 ? (
                            <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center shadow-sm">
                                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 mb-2">All Caught Up!</h3>
                                <p className="text-gray-500">You have no pending payments</p>
                            </div>
                        ) : (
                            pendingPayments.map((payment, index) => (
                                <div
                                    key={payment.id}
                                    className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all animate-slideUp"
                                    style={{ animationDelay: `${index * 100}ms` }}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-start gap-3 mb-2">
                                                <div className={`p-2 rounded-lg ${
                                                    payment.type === "membership" ? "bg-blue-100" :
                                                    payment.type === "tournament" ? "bg-purple-100" :
                                                    "bg-gray-100"
                                                }`}>
                                                    <DollarSign className={`w-5 h-5 ${
                                                        payment.type === "membership" ? "text-blue-600" :
                                                        payment.type === "tournament" ? "text-purple-600" :
                                                        "text-gray-600"
                                                    }`} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-900 text-lg">{payment.description}</h3>
                                                    <p className="text-sm text-gray-600">Due: {payment.dueDate.toLocaleDateString()}</p>
                                                    <span className={`inline-block mt-2 text-xs font-bold px-2 py-1 rounded-full ${
                                                        payment.status === "overdue"
                                                            ? "bg-red-100 text-red-700"
                                                            : "bg-yellow-100 text-yellow-700"
                                                    }`}>
                                                        {payment.status === "overdue" ? "OVERDUE" : "PENDING"}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <div className="text-2xl font-black text-gray-900">${payment.amount.toFixed(2)}</div>
                                            </div>
                                            <button
                                                onClick={() => handlePayment(payment.id)}
                                                disabled={processingPayment === payment.id}
                                                className="bg-[#0071e3] text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-[#005bb5] hover:scale-105 active:scale-95 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                                            >
                                                {processingPayment === payment.id ? (
                                                    <>
                                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Processing...
                                                    </>
                                                ) : (
                                                    <>
                                                        <CreditCard className="w-4 h-4" />
                                                        Pay Now
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === "history" && (
                    <div className="space-y-4 animate-slideUp">
                        {paidPayments.length === 0 ? (
                            <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center shadow-sm">
                                <Receipt className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-gray-900 mb-2">No Payment History</h3>
                                <p className="text-gray-500">Your completed payments will appear here</p>
                            </div>
                        ) : (
                            paidPayments.map((payment, index) => (
                                <div
                                    key={payment.id}
                                    className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all animate-slideUp"
                                    style={{ animationDelay: `${index * 100}ms` }}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-start gap-3 mb-2">
                                                <div className="p-2 bg-green-100 rounded-lg">
                                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-gray-900">{payment.description}</h3>
                                                    <p className="text-sm text-gray-600">
                                                        Paid: {payment.paidDate?.toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-2xl font-black text-gray-900">${payment.amount.toFixed(2)}</div>
                                            {payment.receiptUrl && (
                                                <a
                                                    href={payment.receiptUrl}
                                                    className="p-3 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-all"
                                                    title="Download Receipt"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === "store" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-slideUp">
                        {merchandise.map((item, index) => (
                            <div
                                key={item.id}
                                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-all overflow-hidden group animate-slideUp"
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                <div className="aspect-square bg-gray-100 overflow-hidden">
                                    <img
                                        src={item.image}
                                        alt={item.name}
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                    />
                                </div>
                                <div className="p-4">
                                    <h3 className="font-bold text-gray-900 mb-1">{item.name}</h3>
                                    <p className="text-xs text-gray-500 uppercase mb-3">{item.category}</p>
                                    <div className="flex items-center justify-between">
                                        <div className="text-2xl font-black text-[#0071e3]">${item.price.toFixed(2)}</div>
                                        <button
                                            onClick={() => handleMerchandisePurchase(item.id)}
                                            className="bg-[#0071e3] text-white px-4 py-2 rounded-full font-bold text-xs hover:bg-[#005bb5] hover:scale-105 active:scale-95 transition-all"
                                        >
                                            Add to Cart
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
