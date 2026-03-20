import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { practiceStats } from '../data/practice_stats.js';

// NOTE: You must provide your own Service Account Key
// Download it from Firebase Console -> Project Settings -> Service Accounts
// and save it as 'serviceAccountKey.json' in this directory.
import serviceAccount from './serviceAccountKey.json' assert { type: 'json' };

const app = initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore(app);

async function uploadPracticeStats() {
    console.log('Starting upload to season_archives...');

    const collectionRef = db.collection('season_archives');

    // We'll store practiceStats in a document named 'practice_stats'
    // You could also generate a unique ID or use a different naming convention.
    const docRef = collectionRef.doc('practice_stats');

    try {
        await docRef.set(practiceStats);
        console.log('Successfully uploaded practiceStats to season_archives/practice_stats');
    } catch (error) {
        console.error('Error uploading document:', error);
    }
}

uploadPracticeStats();
