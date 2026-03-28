// portal-data.js
// Data contract for Godspeed Portals - V2 SYSTEM
// All data populated via supabase-data-bridge.js from live Supabase tables.
// No mock/hardcoded data. Empty defaults only.

const GODSPEED_DATA = {
    teams: [],
    coaches: [],
    roster: [],
    reports: {},
    grades: [],
    warRoomInsights: {},
    gameAnalysis: {},
    training: {
        hours: { totalPurchased: 0, used: 0, remaining: 0, expiryDate: null },
        programs: [],
        upcomingSessions: [],
        documents: []
    },
    accounts: [],
    trainingRecords: {}
};

// Database Initialization & Sync
// Only seed empty structure if no cached data exists.
// supabase-data-bridge.js will overlay with live Supabase data on auth.
const storedData = localStorage.getItem('gba_db');

if (!storedData) {
    localStorage.setItem('gba_db', JSON.stringify(GODSPEED_DATA));
    console.log('[PortalData] Initialized empty data structure. Awaiting live data from Supabase.');
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
