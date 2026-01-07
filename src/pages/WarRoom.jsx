import React from 'react';
import { TrendingUp, AlertTriangle, Shield, Zap } from 'lucide-react';
import { roster } from '../data/seed_godspeed_data';

/**
 * WarRoom component displays momentum risers, rotation risks, and the best lineup
 * @returns {JSX.Element} The WarRoom component
 */
const WarRoom = () => {
    // Derived Data with validation
    /** @type {Array<{id: string, name: string, trend: string, tier: string, notes?: string}>} */
    const risers = roster.filter(p => p.trend && (p.trend === 'up' || p.trend === 'rocket' || p.trend === 'Improving'));
    /** @type {Array<{id: string, name: string, trend: string, tier: string, notes?: string}>} */
    const limited = roster.filter(p => p.tier && p.tier.includes('Limited'));

    // Get top 5 players for best lineup (instead of hardcoded names)
    const topPlayers = roster
        .filter(p => p.avg_grade || p.grade)
        .sort((a, b) => (b.avg_grade || b.grade || 0) - (a.avg_grade || a.grade || 0))
        .slice(0, 5);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
            {/* CARD 1: MOMENTUM (Who is hot?) */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-green-100 rounded-lg"><TrendingUp className="w-5 h-5 text-green-700" /></div>
                    <h2 className="font-bold text-gray-900 uppercase">Momentum Risers</h2>
                </div>
                <div className="space-y-3">
                    {risers.length > 0 ? (
                        <>
                            {risers.map(p => (
                                <div key={p.id} className="flex justify-between items-center p-3 bg-green-50 rounded-xl border border-green-100">
                                    <span className="font-bold text-green-900">{p.name}</span>
                                    <span className="text-xs font-bold bg-white px-2 py-1 rounded text-green-700 uppercase">{p.trend}</span>
                                </div>
                            ))}
                            <p className="text-xs text-gray-500 mt-2 italic">Strategy: "Feed the hot hand. Increase minutes."</p>
                        </>
                    ) : (
                        <div className="text-center py-6">
                            <p className="text-gray-400 text-sm">No players showing upward momentum</p>
                        </div>
                    )}
                </div>
            </div>

            {/* CARD 2: ROTATION GAPS (Liabilities) */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle className="w-5 h-5 text-red-700" /></div>
                    <h2 className="font-bold text-gray-900 uppercase">Rotation Risks</h2>
                </div>
                <div className="space-y-3">
                    {limited.length > 0 ? (
                        <>
                            {limited.map(p => (
                                <div key={p.id} className="flex justify-between items-center p-3 bg-red-50 rounded-xl border border-red-100">
                                    <span className="font-bold text-red-900">{p.name}</span>
                                    <span className="text-xs text-red-700">{p.notes || 'Requires development'}</span>
                                </div>
                            ))}
                            <p className="text-xs text-gray-500 mt-2 italic">Directive: "Protect these players. Only use in low-risk scenarios."</p>
                        </>
                    ) : (
                        <div className="text-center py-6">
                            <p className="text-gray-400 text-sm">No rotation concerns at this time</p>
                        </div>
                    )}
                </div>
            </div>

            {/* CARD 3: TOP 5 LINEUP (Best Lineup by Grade) */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm md:col-span-2 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-gray-700 rounded-lg"><Shield className="w-5 h-5 text-yellow-400" /></div>
                    <h2 className="font-bold text-yellow-400 uppercase">Top 5 Lineup</h2>
                </div>
                {topPlayers.length > 0 ? (
                    <>
                        <div className="flex flex-wrap gap-4">
                            {topPlayers.map(player => (
                                <div key={player.id} className="px-4 py-2 bg-gray-700 rounded-lg font-bold border border-gray-600 flex items-center gap-2">
                                    <span>{player.name}</span>
                                    <span className="text-xs text-yellow-400">({player.avg_grade || player.grade})</span>
                                </div>
                            ))}
                        </div>
                        <p className="mt-4 text-gray-400 text-sm">
                            Based on current V2 scores | Identity: "High Motor / Switch Everything"
                        </p>
                    </>
                ) : (
                    <div className="text-center py-6">
                        <p className="text-gray-400">No player data available</p>
                    </div>
                )}
            </div>
        </div>
    );
};
export default WarRoom;
