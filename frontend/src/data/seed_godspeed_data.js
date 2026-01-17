/**
 * Godspeed Performance Backend - Master Season Data
 * 
 * V2 SYSTEM ARCHITECTURE:
 * 1. Roster: Live snapshot with calculated Tiers/Averages.
 * 2. Game Log: Specific box scores and opponent data.
 * 3. Practice History: Time-series evaluation logs.
 * 4. Grading Weights: The Math (Separated from Data).
 */

// PART A: The Roster (Live Snapshot)
export const roster = [
    { id: "p1", name: "Aiden", nickname: "A.D.", tier: "Elite/Starter", avg_grade: 9.05, trend: "Steady", notes: "Elite defender. Must fix baseline drives." },
    { id: "p2", name: "Quest", tier: "Elite/Starter", avg_grade: 8.76, trend: "Up", notes: "High motor. Fixed sprint discipline issues." },
    { id: "p3", name: "Cassius", tier: "Rotation/Starter", avg_grade: 8.33, trend: "Steady", notes: "The Engine. Amazing effort. IQ/Spacing needs work." },
    { id: "p4", name: "A.D. (Big)", tier: "Rotation/Starter", avg_grade: 8.18, trend: "Steady", notes: "Physical force. 83 rebounds sequence. Needs coachability on ball handling." },
    { id: "p5", name: "Howard", tier: "Rotation/Starter", avg_grade: 8.13, trend: "Steady", notes: "Defensive Anchor. Good hustle. Back pedals too high." },
    { id: "p6", name: "Anton", tier: "Rotation/Starter", avg_grade: 8.32, trend: "New", notes: "Plays very well under control. Smart plays." },
    { id: "p7", name: "Emory", tier: "Development", avg_grade: 7.26, trend: "Steady", notes: "Honest effort. Lackluster closeout speed." },
    { id: "p8", name: "Ashton", tier: "Development", avg_grade: 7.53, trend: "Improving", notes: "Amazing defensive slides. Inconsistent effort when un-watched." },
    { id: "p9", name: "Junior", nickname: "Gene Jr", tier: "Limited", avg_grade: 6.54, trend: "Declining", notes: "Spacing issues. Cramped during sprints." },
    { id: "p10", name: "Kyrie", tier: "Limited", avg_grade: 6.35, trend: "Up", notes: "18pts scorer but low effort. Improving closeout speed." },
    { id: "p11", name: "Oliver", tier: "Rotation/Starter", avg_grade: 8.12, trend: "Rocket", notes: "Huge jump in Practice 8. 'Best practice yet'." },
    { id: "p12", name: "Khalik", tier: "Limited", avg_grade: 6.93, trend: "Improving", notes: "Learning help defense. Hands are improving." }
];

// PART B: The Game Stats (Weeks Tournament)
export const gameLog = [
    {
        id: "game_weeks_1",
        date: "Dec 07",
        opponent: "Weeks Tournament",
        result: "Win (2 of 3)",
        starters: ["p10", "p2", "p9", "p5", "p4"], // Kyrie, Quest, Junior, Howard, A.D.
        standouts: [
            { playerId: "p4", stats: { rebounds: 8, steals: 4, blocks: 1, points: 6 }, notes: "Dominant interior force. 3 consecutive rebounds." },
            { playerId: "p5", stats: { steals: 5, rebounds: 4, points: 2 }, notes: "Defensive anchor. Steal leader." },
            { playerId: "p6", stats: { points: 7, steals: 1 }, notes: "MVP Candidate. Played very under control. And-1." },
            { playerId: "p2", stats: { steals: 3, deflections: 4, points: 5 }, notes: "High disruptive energy." },
            { playerId: "p7", stats: { steals: 2, points: 2 }, notes: "Back-to-back steals. High intensity burst." }
        ]
    }
];

// PART C: Practice Logs (The Data Spike)
export const practiceHistory = [
    {
        id: "prac_008",
        focus: "Red Defense",
        grades: [
            { playerId: "p11", grade: 9.0, notes: "Best practice yet. Really hard defense." }, // Oliver
            { playerId: "p1", grade: 9.2, notes: "Standard excellence." },
            { playerId: "p5", grade: 9.0, notes: "Good defense. Multiple spots." }
        ]
    },
    {
        id: "prac_009",
        date: "Dec 16",
        focus: "Team Execution",
        attendance: {
            absent: ["p10", "p9", "p8", "p5", "p12"], // Khyrie, Junior, Ashton, Howard, Khalik
            present: ["p1", "p2", "p3", "p4", "p6", "p7", "p11"]
        },
        grades: [
            { playerId: "p1", scores: { effort: 8.8, comp: 8.8, avg: 8.8 }, notes: "Exceptional job." },
            { playerId: "p2", scores: { effort: 8.8, comp: 8.8, avg: 8.8 }, notes: "High motor maintained." },
            { playerId: "p3", scores: { effort: 8.5, comp: 8.5, avg: 8.5 }, notes: "Solid engine." },
            { playerId: "p4", scores: { effort: 8.5, comp: 8.5, avg: 8.5 }, notes: "Good physical presence." },
            { playerId: "p6", scores: { effort: 8.5, comp: 8.5, avg: 8.5 }, notes: "Under control." },
            { playerId: "p7", scores: { effort: 8.2, comp: 8.2, avg: 8.2 }, notes: "Stepped up level." },
            { playerId: "p11", scores: { effort: 8.0, comp: 8.0, avg: 8.0 }, notes: "Zero complaints. Fully engaged." }
        ]
    }
];

// PART D: Grading Weights (The Math)
export const gradingWeights = {
    effort_energy: 0.20,
    competitiveness: 0.20,
    on_ball_defense: 0.15,
    help_rotations: 0.15,
    coachability: 0.15,
    communication: 0.10,
    offense_shooting: 0.05
};

// Utilities
export const calculateWeightedAverage = (scores) => {
    if (!scores) return 0;
    // Simple average if 'avg' is explicitly provided (legacy/override support)
    if (scores.avg) return scores.avg;

    let totalScore = 0;
    // Map input keys to weight keys if necessary
    const keyMap = {
        effort: 'effort_energy',
        comp: 'competitiveness',
        onBall: 'on_ball_defense',
        help: 'help_rotations',
        coach: 'coachability',
        comm: 'communication',
        offense: 'offense_shooting'
    };

    for (const [scoreKey, scoreValue] of Object.entries(scores)) {
        const weightKey = keyMap[scoreKey];
        const weight = gradingWeights[weightKey];
        if (weight !== undefined) {
            totalScore += scoreValue * weight;
        }
    }
    return parseFloat(totalScore.toFixed(2));
};

// COACH'S DASHBOARD INSIGHTS (Computed Snapshot)
// This can be dynamically generated, but here is the seed snapshot.
export const warRoomInsights = {
    hotHand: {
        playerId: "p11", // Oliver
        metric: "Trending up +2.5 points over last 2 practices",
        description: "Consistency spike."
    },
    ironFive: [
        "p1", "p2", "p3", "p4", "p5" // Aiden, Quest, Cassius, A.D., Howard
    ],
    effortWarning: [
        "p9", "p10" // Junior, Kyrie
    ],
    mvpOfWeek: {
        playerId: "p6", // Anton
        reason: "Highest 'Control' rating + Efficiency"
    }
};
