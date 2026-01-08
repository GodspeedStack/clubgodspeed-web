import React, { useState } from 'react';
import AthleteProfileModal from '../../components/modals/AthleteProfileModal';
import { roster } from '../../data/seed_godspeed_data';

/**
 * @typedef {Object} Player
 * @property {string} id - Player ID
 * @property {string} name - Player name
 * @property {string} tier - Player tier
 * @property {string} initials - Player initials
 * @property {number} [avg_grade] - Average grade
 * @property {number} [grade] - Grade
 * @property {string} [trend] - Trend indicator
 * @property {string} [notes] - Additional notes
 * @property {string} [image] - Player image URL
 * @property {Array<string>} [highlights] - Player highlights
 */

/**
 * TeamRoster component displays the team roster with player details
 * @returns {JSX.Element} The TeamRoster component
 */
const TeamRoster = () => {
    /** @type {[Player | null, React.Dispatch<React.SetStateAction<Player | null>>]} */
    const [selectedPlayer, setSelectedPlayer] = useState(null);

    /**
     * Get the appropriate color class based on player tier
     * @param {string} tier - The player's tier
     * @returns {string} Tailwind CSS classes for the tier badge
     */
    const getTierColor = (tier) => {
        if (tier.includes('Elite')) return 'bg-yellow-100 text-yellow-800';
        if (tier.includes('Rotation')) return 'bg-blue-100 text-blue-800';
        if (tier.includes('Development')) return 'bg-gray-100 text-gray-800';
        return 'bg-red-100 text-red-800';
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-lg sm:text-xl font-black text-gray-900 uppercase">Team Roster</h2>
                <span className="text-xs sm:text-sm font-bold text-gray-500">{roster.length} Athletes</span>
            </div>

            {roster.length === 0 ? (
                <div className="p-8 text-center">
                    <div className="text-gray-300 text-5xl mb-3">👥</div>
                    <p className="text-gray-500">No players in roster</p>
                </div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {roster.map(player => (
                        <div
                            key={player.id}
                            onClick={() => setSelectedPlayer(player)}
                            className="p-3 sm:p-4 hover:bg-blue-50 cursor-pointer transition-all duration-200 flex items-center justify-between group border-l-4 border-l-transparent hover:border-l-[#0071e3] hover:shadow-md"
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setSelectedPlayer(player);
                                }
                            }}
                        >
                        <div className="flex items-center gap-3 sm:gap-4">
                            <div className="w-12 h-12 sm:w-10 sm:h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 text-sm sm:text-base flex-shrink-0">
                                {player.initials || player.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 text-sm sm:text-base">{player.name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${getTierColor(player.tier)}`}>
                                        {player.tier}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                            <div className="text-base sm:text-lg font-black text-gray-900">{player.avg_grade || player.grade}</div>
                            <div className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden sm:block">V2 Score</div>
                        </div>
                    </div>
                    ))}
                </div>
            )}

            {selectedPlayer && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setSelectedPlayer(null);
                        }
                    }}
                >
                    <div className="w-full max-w-3xl">
                        <AthleteProfileModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeamRoster;
