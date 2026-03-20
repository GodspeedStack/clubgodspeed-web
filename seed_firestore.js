const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// CONFIGURATION
const SERVICE_ACCOUNT_PATH = './serviceAccountKey.json'; // User must place file here
const COLLECTION_PATH = 'teams/10u_gold/roster';

// DATA TO SEED
const rosterData = [
    { "name": "Aiden Candies", "email": "Marvincandies@gmail.com", "role": "Player" },
    { "name": "Anton Blyakhman", "email": "DenisBlyakhman@gmail.com", "role": "Player" },
    { "name": "Ashton Bowman", "email": "Jamaican.mel@gmail.com", "role": "Player" },
    { "name": "Aydyon Tuiono", "email": "Donnatuiono@gmail.com", "role": "Player" },
    { "name": "Cassius Henley", "email": "typebeatsz@gmail.com", "role": "Player" },
    { "name": "Emory White", "email": "shanicel.white@gmail.com", "role": "Player" },
    { "name": "Gene Fashaw Jr", "email": "gene.fashaw@gmail.com", "role": "Player" },
    { "name": "Howard Smallwood", "email": "naes02329@gmail.com", "role": "Player" },
    { "name": "Khaliq Makara", "email": "K.mdjizo3@gmail.com", "role": "Player" },
    { "name": "Khyrie Dixon", "email": "jeriiberii@gmail.com", "role": "Player" },
    { "name": "Ky’ran Smith", "email": "kyrankiah31@gmail.com", "role": "Player" },
    { "name": "Quest Scott", "email": "Jaiscott7@gmail.com", "role": "Player" }
];

async function seedDatabase() {
    // 1. Check for Service Account
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        console.error(`\n❌ ERROR: Service Account Key not found at ${SERVICE_ACCOUNT_PATH}`);
        console.error('Please download your service account key from Firebase Console -> Project Settings -> Service Accounts');
        console.error('Rename it to "serviceAccountKey.json" and place it in this directory.\n');
        process.exit(1);
    }

    // 2. Initialize Firebase
    try {
        const serviceAccount = require(SERVICE_ACCOUNT_PATH);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin Initialized');
    } catch (error) {
        console.error('❌ Failed to initialize Firebase:', error.message);
        process.exit(1);
    }

    const db = admin.firestore();

    // 3. Batch Write
    console.log(`\n🌱 Seeding ${rosterData.length} players to "${COLLECTION_PATH}"...`);

    const batch = db.batch();

    rosterData.forEach((player) => {
        // Determine Document ID: Use email as ID for uniqueness/easy lookup, or auto-id
        // Implementing CLEAN document IDs based on name (e.g., 'aiden_candies')
        const docId = player.name.toLowerCase().replace(/[^a-z0-9]/g, '_');

        // Reference: teams -> 10u_gold -> roster -> [docId]
        // Note: 'teams/10u_gold' document must theoretically exist for subcollection logic in console, 
        // but Firestore creates it implicitly.
        const docRef = db.collection('teams').doc('10u_gold').collection('roster').doc(docId);

        batch.set(docRef, {
            ...player,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });

    try {
        await batch.commit();
        console.log('✅ Successfully seeded roster!');
        console.log('-----------------------------------');
        console.log('Collection: teams/10u_gold/roster');
        console.log('Documents Created:', rosterData.length);
    } catch (error) {
        console.error('❌ Firestore Batch Write Failed:', error);
    }
}

seedDatabase();
