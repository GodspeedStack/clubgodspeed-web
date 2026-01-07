"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

interface AuthContextType {
    user: User | null;
    loading: boolean;
    loggingOut: boolean;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    loggingOut: false,
    logout: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [loggingOut, setLoggingOut] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const logout = async () => {
        setLoggingOut(true);
        try {
            await signOut(auth);
            router.push("/");
        } catch (error) {
            console.error("Logout failed:", error);
            // Still set loggingOut to false on error so UI recovers
            setLoggingOut(false);
            // You might want to show a toast/alert here
            throw error; // Re-throw so caller can handle if needed
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, loggingOut, logout }}>
            {children}
        </AuthContext.Provider>
    );
};
