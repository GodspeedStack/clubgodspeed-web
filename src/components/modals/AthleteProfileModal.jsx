import React from 'react';
import { X, Share, Save, Trophy, Activity, Quote } from 'lucide-react'; // Added Icons
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { practiceHistory, gameLog } from '../../data/seed_godspeed_data'; // IMPORT GAMELOG

/**
 * @typedef {Object} Player
 * @property {string} id - Player ID
 * @property {string} name - Player name
 * @property {string} tier - Player tier
 * @property {string} initials - Player initials
 * @property {number} [avg_grade] - Average grade
 * @property {number} [grade] - Grade
 * @property {string} [image] - Player image URL
 * @property {Array<string>} [highlights] - Player highlights
 */

/**
 * @typedef {Object} PlayerStats
 * @property {string} playerId - Player ID
 * @property {Object} stats - Player statistics
 * @property {number} [stats.points] - Points scored
 * @property {number} [stats.steals] - Steals
 * @property {number} [stats.rebounds] - Rebounds
 */

/**
 * AthleteProfileModal component displays detailed player information
 * @param {Object} props - Component props
 * @param {Player | null} props.player - The player object to display
 * @param {() => void} props.onClose - Callback function to close the modal
 * @returns {JSX.Element | null} The modal component or null if no player
 */
const AthleteProfileModal = ({ player, onClose }) => {
    if (!player) return null;

    // Handle ESC key press
    React.useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // 1. GET GRAPH DATA (Last 9 Sessions)
    const graphData = practiceHistory
        .map(session => {
            const gradeEntry = session.grades.find(g => g.playerId === player.id);
            return {
                name: session.id.replace('prac_', 'P'),
                score: gradeEntry ? gradeEntry.avg : null
            };
        })
        .filter(item => item.score !== null)
        .slice(-9);

    // 2. GET LATEST GAME STATS (Weeks Tournament)
    // Looks inside the most recent game for this player's specific stats
    const latestGame = gameLog[0]; // Assuming first entry is newest
    const playerStats = latestGame?.standouts?.find(s => s.playerId === player.id);

    return (
        <div
            className="relative bg-white rounded-[24px] w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl animate-slideUp"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors z-10 focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                aria-label="Close modal"
            >
                <X className="w-5 h-5 text-gray-500" />
            </button>

            <div className="p-6 md:p-8 space-y-6">
                {/* HEADER (Identity) */}
                <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                    <div className="flex items-center gap-5">
                        {/* Use Custom Image if available, else Initials */}
                        {player.image ? (
                            <img src={player.image} alt={player.name} className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-gray-100 shadow-sm" />
                        ) : (
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gray-100 flex items-center justify-center text-2xl sm:text-3xl font-bold text-gray-500">
                                {player.initials}
                            </div>
                        )}
                        <div>
                            <h2 id="modal-title" className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight uppercase">{player.name}</h2>
                            <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide
                ${player.tier.includes('Elite') ? 'bg-yellow-100 text-yellow-700' :
                                    player.tier.includes('Rotation') ? 'bg-blue-100 text-blue-700' :
                                        player.tier.includes('Development') ? 'bg-gray-100 text-gray-700' :
                                            'bg-red-100 text-red-700'}`}>
                                {player.tier}
                            </span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Current V2 Score</div>
                        <div className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tighter">{player.grade || player.avg_grade || "N/A"}</div>

                    </div>
                </div>

                {/* STATS ROW (Dynamic from Game Log) */}
                {playerStats ? (
                    <div className="grid grid-cols-3 gap-3 sm:gap-4">
                        <div className="bg-gray-50 p-3 sm:p-4 rounded-2xl border border-gray-100 text-center">
                            <div className="text-gray-400 text-[10px] sm:text-xs font-bold uppercase">Points</div>
                            <div className="text-xl sm:text-2xl font-black text-gray-900">{playerStats.stats.points || 0}</div>
                        </div>
                        <div className="bg-gray-50 p-3 sm:p-4 rounded-2xl border border-gray-100 text-center">
                            <div className="text-gray-400 text-[10px] sm:text-xs font-bold uppercase">Steals</div>
                            <div className="text-xl sm:text-2xl font-black text-gray-900">{playerStats.stats.steals || 0}</div>
                        </div>
                        <div className="bg-gray-50 p-3 sm:p-4 rounded-2xl border border-gray-100 text-center">
                            <div className="text-gray-400 text-[10px] sm:text-xs font-bold uppercase">Rebounds</div>
                            <div className="text-xl sm:text-2xl font-black text-gray-900">{playerStats.stats.rebounds || 0}</div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center">
                        <p className="text-gray-500 text-sm">No recent game stats available</p>
                    </div>
                )}

                {/* HIGHLIGHTS SECTION ("Good Things") */}
                {player.highlights && player.highlights.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <Trophy className="w-4 h-4 text-yellow-600" />
                            <h3 className="text-yellow-800 font-bold text-xs uppercase tracking-wide">Recent Highlights</h3>
                        </div>
                        <ul className="space-y-2">
                            {player.highlights.map((highlight, index) => (
                                <li key={index} className="flex items-start text-sm text-yellow-900 font-medium">
                                    <span className="mr-2">•</span>
                                    "{highlight}"
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* GRAPH SECTION */}
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
                            <Activity className="w-4 h-4 text-blue-500" />
                            Performance Trajectory
                        </h3>
                        <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-xs font-bold">Last 9 Sessions</span>
                    </div>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={graphData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10 }} dy={10} />
                                <YAxis domain={[0, 10]} axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                <Line type="monotone" dataKey="score" stroke="#2563EB" strokeWidth={3} dot={{ r: 3, fill: '#2563EB', strokeWidth: 2, stroke: '#fff' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default AthleteProfileModal;
