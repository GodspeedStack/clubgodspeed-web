import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Godspeed Parent Portal | Track Your Athlete's Performance",
    description: "Access your athlete's performance data, view digital trading cards, and stay connected with Godspeed Basketball. Secure parent portal for tracking player progress.",
    keywords: "basketball, youth sports, athlete tracking, parent portal, performance metrics, Godspeed Basketball",
    authors: [{ name: "Godspeed Basketball" }],
    creator: "Godspeed Basketball",
    publisher: "Godspeed Basketball",
    robots: "index, follow",
    openGraph: {
        type: "website",
        locale: "en_US",
        url: "https://clubgodspeed.com",
        siteName: "Godspeed Basketball",
        title: "Godspeed Parent Portal | Track Your Athlete's Performance",
        description: "Access your athlete's performance data, view digital trading cards, and stay connected with Godspeed Basketball.",
        images: [
            {
                url: "/images/og-image.jpg",
                width: 1200,
                height: 630,
                alt: "Godspeed Basketball Parent Portal",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Godspeed Parent Portal",
        description: "Track your athlete's performance with Godspeed Basketball",
        images: ["/images/og-image.jpg"],
    },
    viewport: {
        width: "device-width",
        initialScale: 1,
        maximumScale: 5,
    },
    themeColor: "#0071e3",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <AuthProvider>{children}</AuthProvider>
            </body>
        </html>
    );
}
