"use client";

import { useRef, useState } from "react";
// @ts-ignore - User needs to install types: npm i --save-dev @types/html2canvas
import html2canvas from "html2canvas";

interface AthleteTradingCardProps {
    name: string;
    team: string;
    number: string;
    position: string;
    height: string;
    gradYear: string;
    photoUrl?: string; // Optional, defaults to placeholder
}

export default function AthleteTradingCard({
    name,
    team,
    number,
    position,
    height,
    gradYear,
    photoUrl
}: AthleteTradingCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const [isSharing, setIsSharing] = useState(false);

    const handleShare = async () => {
        if (!cardRef.current) return;
        setIsSharing(true);

        try {
            // Small timeout to ensure styles are stable
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(cardRef.current, {
                scale: 2, // Retina quality
                backgroundColor: null, // Allow transparency if needed
                logging: false,
            });

            // Convert to blob and download/share
            canvas.toBlob(async (blob) => {
                if (!blob) return;

                // Web Share API if supported (Mobile)
                if (navigator.share) {
                    try {
                        const file = new File([blob], `${name.replace(/\s+/g, '_')}_Card.png`, { type: "image/png" });
                        await navigator.share({
                            title: `${name} - Godspeed Trading Card`,
                            text: `Check out my athlete profile on Godspeed!`,
                            files: [file],
                        });
                    } catch (e) {
                        console.log("Share failed or cancelled", e);
                        downloadImage(canvas); // Fallback
                    }
                } else {
                    // Desktop Fallback
                    downloadImage(canvas);
                }
            });
        } catch (err) {
            console.error("Card generation failed:", err);
        } finally {
            setIsSharing(false);
        }
    };

    const downloadImage = (canvas: HTMLCanvasElement) => {
        const link = document.createElement("a");
        link.download = `${name.replace(/\s+/g, '_')}_GodspeedCard.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    };

    return (
        <div className="flex flex-col items-center">
            {/* Card Container - The part that gets screenshotted */}
            <div
                ref={cardRef}
                className="relative w-[320px] h-[450px] bg-black rounded-xl overflow-hidden shadow-2xl transition-transform hover:scale-[1.02]"
                style={{
                    boxShadow: "0 0 30px rgba(0, 113, 227, 0.4)",
                    border: "1px solid rgba(255, 255, 255, 0.2)"
                }}
            >
                {/* Background Effects */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#111] to-[#0a0a0a] z-0"></div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#0071e3] opacity-20 blur-[50px] rounded-full z-0"></div>
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-[#f59e0b] opacity-10 blur-[60px] rounded-full z-0"></div>

                {/* Content Layer */}
                <div className="relative z-10 flex flex-col h-full p-4">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-2">
                        <div className="text-white">
                            <div className="text-[10px] font-bold tracking-[0.2em] text-[#0071e3] uppercase mb-1">Godspeed</div>
                            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">{team}</div>
                        </div>
                        <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-400 italic" style={{ fontFamily: 'Impact, sans-serif' }}>
                            {number}
                        </div>
                    </div>

                    {/* Photo Area */}
                    <div className="flex-grow relative mx-2 my-2 bg-gradient-to-b from-gray-800 to-black rounded-lg overflow-hidden border border-gray-700 shadow-inner">
                        {photoUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={photoUrl} alt={name} className="w-full h-full object-cover mix-blend-overlay opacity-80" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-900">
                                <span className="text-gray-600 text-5xl">🏀</span>
                            </div>
                        )}
                        {/* Gloss Effect */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white to-transparent opacity-10 pointer-events-none"></div>
                    </div>

                    {/* Footer Info */}
                    <div className="mt-2">
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight leading-none mb-2">{name}</h2>
                        <div className="flex justify-between items-center border-t border-gray-700 pt-2">
                            <div className="flex flex-col">
                                <span className="text-[10px] text-gray-500 uppercase font-bold">Position</span>
                                <span className="text-sm font-bold text-[#f59e0b]">{position}</span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-[10px] text-gray-500 uppercase font-bold">Class</span>
                                <span className="text-sm font-bold text-white">'{gradYear}</span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-[10px] text-gray-500 uppercase font-bold">Height</span>
                                <span className="text-sm font-bold text-white">{height}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Holographic Border Overlay */}
                <div className="absolute inset-0 border-[6px] border-white/5 rounded-xl pointer-events-none"></div>
            </div>

            {/* Action Button */}
            <button
                onClick={handleShare}
                disabled={isSharing}
                className="mt-6 bg-[#0071e3] hover:bg-[#005bb5] text-white px-6 py-2.5 rounded-full font-bold text-sm tracking-wide shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
            >
                {isSharing ? (
                    <>
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        GENERATING...
                    </>
                ) : (
                    <>
                        <span>SHARE CARD</span>
                        <span className="text-lg">📤</span>
                    </>
                )}
            </button>
            <p className="mt-2 text-[10px] text-gray-400 max-w-[320px] text-center">
                Requires <code>npm install html2canvas</code> to work.
            </p>
        </div>
    );
}
