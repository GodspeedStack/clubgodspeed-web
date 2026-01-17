import React, { useState } from 'react';
import AthleteProfileModal from '../../components/modals/AthleteProfileModal';
import { roster } from '../../data/seed_godspeed_data';

const TeamRoster = () => {
    const [selectedPlayer, setSelectedPlayer] = useState(null);

    const getTierColor = (tier) => {
        if (tier.includes('Elite')) return 'bg-yellow-100 text-yellow-800';
        if (tier.includes('Rotation')) return 'bg-blue-100 text-blue-800';
        if (tier.includes('Development')) return 'bg-gray-100 text-gray-800';
        return 'bg-red-100 text-red-800';
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-xl font-black text-gray-900 uppercase">Team Roster</h2>
                <span className="text-sm font-bold text-gray-500">{roster.length} Athletes</span>
            </div>

            <div className="divide-y divide-gray-100">
                {roster.map(player => (
                    <div
                        key={player.id}
                        onClick={() => setSelectedPlayer(player)}
                        className="p-4 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500">
                                {player.initials || player.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">{player.name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${getTierColor(player.tier)}`}>
                                        {player.tier}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-lg font-black text-gray-900">{player.avg_grade || player.grade}</div>
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">V2 Score</div>
                        </div>
                    </div>
                ))}
            </div>

            {selectedPlayer && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-3xl">
                        <AthleteProfileModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeamRoster;
