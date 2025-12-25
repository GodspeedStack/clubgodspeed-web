// portal-data.js
// Simulates a backend database for Godspeed Portals - V2 SYSTEM

const GODSPEED_DATA = {
    // 1. Teams Configuration (Preserved)
    teams: [
        { id: 'TEAM-10U-DEV-BLACK', name: '10U Development Black', category: '10U Development', coach: 'Coach Sarah' }
    ],

    // 2. The Roster (Live Snapshot: Finalized 12-Man Squad)
    roster: [
        { athleteId: "p1", teamId: 'TEAM-10U-DEV-BLACK', name: "Aiden", initials: "Ai", tier: "Elite/Starter", avg_grade: 9.05, trend: "Steady", notes: "Fix baseline drives" },
        { athleteId: "p2", teamId: 'TEAM-10U-DEV-BLACK', name: "Quest", initials: "Q", tier: "Elite/Starter", avg_grade: 8.76, trend: "Up", notes: "Fixed sprint discipline" },
        { athleteId: "p3", teamId: 'TEAM-10U-DEV-BLACK', name: "Cassius", initials: "C", tier: "Rotation/Starter", avg_grade: 8.20, trend: "Steady", notes: "IQ/Spacing needs work" },
        { athleteId: "p4", teamId: 'TEAM-10U-DEV-BLACK', name: "A.D.", initials: "AD", tier: "Rotation/Starter", avg_grade: 8.00, trend: "Steady", notes: "Needs coachability" },
        { athleteId: "p5", teamId: 'TEAM-10U-DEV-BLACK', name: "Howard", initials: "H", tier: "Rotation/Starter", avg_grade: 8.86, trend: "Up", notes: "Defensive Anchor" },
        { athleteId: "p6", teamId: 'TEAM-10U-DEV-BLACK', name: "Anton", initials: "A", tier: "Rotation/Starter", avg_grade: 8.35, trend: "New", notes: "Plays under control" },
        { athleteId: "p11", teamId: 'TEAM-10U-DEV-BLACK', name: "Oliver", initials: "O", tier: "Rotation/Starter", avg_grade: 8.12, trend: "Rocket", notes: "Huge jump in Practice 8" }, // PROMOTED
        { athleteId: "p7", teamId: 'TEAM-10U-DEV-BLACK', name: "Emory", initials: "E", tier: "Development", avg_grade: 7.30, trend: "Steady", notes: "Lackluster closeouts" },
        {
            athleteId: "p8",
            teamId: 'TEAM-10U-DEV-BLACK',
            name: "Ashton",
            initials: "A",
            image: "src/assets/athletes/ashton_comic.jpg",
            tier: "Development",
            avg_grade: 7.55,
            trend: "Steady",
            notes: "Amazing slides. Needs consistent motor.",
            highlights: [
                "Amazing job on defensive slides [Prac 5]",
                "Immediate coachability: 'Had to run faster, and he did'",
                "Helped teammate with positioning"
            ]
        },
        { athleteId: "p9", teamId: 'TEAM-10U-DEV-BLACK', name: "Junior", initials: "J", tier: "Limited", avg_grade: 6.65, trend: "Declining", notes: "Scheme IQ / Conditioning" }, // "down" maps to Declining/Red arrow
        { athleteId: "p10", teamId: 'TEAM-10U-DEV-BLACK', name: "Kyrie", initials: "K", tier: "Limited", avg_grade: 7.55, trend: "Up", notes: "Improving closeouts" },
        { athleteId: "p12", teamId: 'TEAM-10U-DEV-BLACK', name: "Khalik", initials: "K", tier: "Limited", avg_grade: 6.93, trend: "Steady", notes: "Learning help defense" }
    ],

    // 3. Reports & Analytics (Merged V2 Structure)
    reports: {}, // Will be populated dynamically or via specific seeds if needed

    // 4. Practice Grades (Flattened V2 Data)
    grades: [
        // Practice 8 (Red Defense)
        { gradeId: 'P8-p11', athleteId: 'p11', date: '2025-11-01', type: 'Practice', scores: { focus: 9, hustle: 9, skill: 9, iq: 9, avg: 9.0 }, notes: "Best practice yet. Really hard defense." },
        { gradeId: 'P8-p1', athleteId: 'p1', date: '2025-11-01', type: 'Practice', scores: { focus: 9, hustle: 9, skill: 9, iq: 9, avg: 9.2 }, notes: "Standard excellence." },
        { gradeId: 'P8-p5', athleteId: 'p5', date: '2025-11-01', type: 'Practice', scores: { focus: 9, hustle: 9, skill: 9, iq: 9, avg: 9.0 }, notes: "Good defense. Multiple spots." },

        // Practice 9 (Team Execution) - Dec 16
        { gradeId: 'P9-p1', athleteId: 'p1', date: '2025-12-16', type: 'Practice', scores: { focus: 9, hustle: 9, skill: 9, iq: 9, effort: 8.8, comp: 8.8, avg: 8.8 }, notes: "Exceptional job." },
        { gradeId: 'P9-p2', athleteId: 'p2', date: '2025-12-16', type: 'Practice', scores: { focus: 9, hustle: 9, skill: 9, iq: 9, effort: 8.8, comp: 8.8, avg: 8.8 }, notes: "High motor maintained." },
        { gradeId: 'P9-p3', athleteId: 'p3', date: '2025-12-16', type: 'Practice', scores: { focus: 8, hustle: 9, skill: 8, iq: 8, effort: 8.5, comp: 8.5, avg: 8.5 }, notes: "Solid engine." },
        { gradeId: 'P9-p4', athleteId: 'p4', date: '2025-12-16', type: 'Practice', scores: { focus: 8, hustle: 9, skill: 8, iq: 8, effort: 8.5, comp: 8.5, avg: 8.5 }, notes: "Good physical presence." },
        { gradeId: 'P9-p6', athleteId: 'p6', date: '2025-12-16', type: 'Practice', scores: { focus: 8, hustle: 9, skill: 8, iq: 8, effort: 8.5, comp: 8.5, avg: 8.5 }, notes: "Under control." },
        { gradeId: 'P9-p7', athleteId: 'p7', date: '2025-12-16', type: 'Practice', scores: { focus: 8, hustle: 8, skill: 8, iq: 8, effort: 8.2, comp: 8.2, avg: 8.2 }, notes: "Stepped up level." },
        { gradeId: 'P9-p11', athleteId: 'p11', date: '2025-12-16', type: 'Practice', scores: { focus: 8, hustle: 8, skill: 8, iq: 8, effort: 8.0, comp: 8.0, avg: 8.0 }, notes: "Zero complaints. Fully engaged." }
    ],

    // 5. War Room Insights (Coach's Dashboard)
    warRoomInsights: {
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
    },

    // 6. Game Analysis (Weeks Tournament)
    gameAnalysis: {
        meta: {
            opponent: "Weeks Tournament",
            date: "Dec 07",
            result: "Win (2 of 3)"
        },
        recentGames: [
            { date: "Sat, 12/07", opponent: "Weeks", result: "Win", score: "42-38" }
        ],
        standouts: [
            { playerId: "p4", stats: { rebounds: 8, steals: 4, blocks: 1, points: 6 }, notes: "Dominant interior force. 3 consecutive rebounds." },
            { playerId: "p5", stats: { steals: 5, rebounds: 4, points: 2 }, notes: "Defensive anchor. Steal leader." },
            { playerId: "p6", stats: { points: 7, steals: 1 }, notes: "MVP Candidate. Played very under control. And-1." },
            { playerId: "p2", stats: { steals: 3, deflections: 4, points: 5 }, notes: "High disruptive energy." },
            { playerId: "p7", stats: { steals: 2, points: 2 }, notes: "Back-to-back steals. High intensity burst." },
            {
                playerId: "p8",
                stats: { points: 3, steals: 1, rebounds: 1 },
                notes: "High Hustle: Secured steal, good rebound -> coast-to-coast layup. Made FT."
            }
        ],
        fourFactors: null,
        invisibleBoxScore: null,
        trends: null,
        patterns: null,
        prescription: null
    }
};

// Database Initialization & Sync
const storedData = localStorage.getItem('gba_db');
// Force overwrite for this "Seed" action to ensure V2 data is live
const forceSeed = true;

if (!storedData || forceSeed) {
    // Generate Reports (Derived from Roster)
    const derivedReports = {};
    GODSPEED_DATA.roster.forEach(p => {
        derivedReports[p.id] = {
            tier: p.tier,
            avg: p.avg_grade,
            trend: p.trend,
            focus: "General Development",
            content: `<h4>Performance Snapshot</h4><p>${p.notes}</p>`
        };
    });
    GODSPEED_DATA.reports = derivedReports;

    localStorage.setItem('gba_db', JSON.stringify(GODSPEED_DATA));
    console.log('Database Re-Seeded with V2 System Data');
}

// Helper: Get DB
let GBA_DB_CACHE = null;
function getDB() {
    if (GBA_DB_CACHE) return GBA_DB_CACHE;
    const data = JSON.parse(localStorage.getItem('gba_db')) || GODSPEED_DATA;
    GBA_DB_CACHE = data;
    return data;
}

function saveDB(data) {
    GBA_DB_CACHE = data;
    localStorage.setItem('gba_db', JSON.stringify(data));
}
