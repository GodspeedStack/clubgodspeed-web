/**
 * Firestore Seed Data Script
 *
 * This script populates Firestore with sample data for testing the Parent Portal features.
 *
 * Usage:
 * 1. Make sure Firebase Admin SDK is configured
 * 2. Run: node godspeed-portal/scripts/seedFirestoreData.js
 *
 * Note: This requires Firebase Admin SDK. Install with:
 * npm install firebase-admin
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin (you'll need to add your service account key)
// admin.initializeApp({
//   credential: admin.credential.cert(require('./serviceAccountKey.json'))
// });

// const db = admin.firestore();

// Sample user ID - replace with actual test user ID
const TEST_USER_ID = 'test-parent-123';

const seedData = {
  // Stats data
  stats: [
    {
      athleteId: 'athlete1',
      athleteName: 'John Smith',
      performanceData: [
        { date: 'Jan 1', score: 7.2, drills: 12, attendance: 100 },
        { date: 'Jan 8', score: 7.5, drills: 14, attendance: 100 },
        { date: 'Jan 15', score: 7.8, drills: 15, attendance: 100 },
        { date: 'Jan 22', score: 8.1, drills: 16, attendance: 100 },
        { date: 'Jan 29', score: 8.3, drills: 17, attendance: 100 },
        { date: 'Feb 5', score: 8.5, drills: 18, attendance: 100 },
        { date: 'Feb 12', score: 8.7, drills: 19, attendance: 100 },
        { date: 'Feb 19', score: 8.9, drills: 20, attendance: 100 },
      ],
      skillBreakdown: [
        { skill: 'Shooting', level: 8.5 },
        { skill: 'Defense', level: 7.8 },
        { skill: 'Ball Handling', level: 8.2 },
        { skill: 'Passing', level: 7.5 },
        { skill: 'Hustle', level: 9.0 },
        { skill: 'IQ', level: 8.0 },
      ],
      summary: {
        avgScore: 8.3,
        improvement: 23,
        attendanceRate: 100,
        topSkill: 'Hustle',
      },
    },
  ],

  // Events/Schedule data
  events: [
    {
      title: 'Team Practice',
      type: 'practice',
      date: new Date(2026, 0, 10),
      time: '4:00 PM - 6:00 PM',
      location: 'Main Gym',
      description: 'Regular team practice - Focus on defensive drills',
      status: 'upcoming',
    },
    {
      title: 'vs Thunder',
      type: 'game',
      date: new Date(2026, 0, 12),
      time: '7:00 PM',
      location: 'Lincoln High School',
      description: 'League game',
      status: 'upcoming',
    },
    {
      title: 'Shooting Practice',
      type: 'practice',
      date: new Date(2026, 0, 15),
      time: '5:30 PM - 7:00 PM',
      location: 'Main Gym',
      description: 'Advanced shooting drills',
      status: 'upcoming',
    },
    {
      title: 'MLK Tournament',
      type: 'tournament',
      date: new Date(2026, 0, 18),
      time: 'All Day',
      location: 'Convention Center',
      description: '3-day tournament - Check in at 8:00 AM',
      status: 'upcoming',
    },
    {
      title: 'vs Eagles',
      type: 'game',
      date: new Date(2026, 0, 20),
      time: '6:00 PM',
      location: 'Home Court',
      description: 'Home game',
      status: 'upcoming',
    },
  ],

  // Messages data
  messages: [
    {
      coachId: 'coach1',
      coachName: 'Coach Johnson',
      lastMessage: 'Great progress at practice today!',
      lastMessageTime: new Date(2026, 0, 8, 16, 30),
      unreadCount: 2,
      conversation: [
        {
          from: 'parent',
          fromName: 'Parent',
          content: 'Hi Coach, how is my son doing?',
          timestamp: new Date(2026, 0, 7, 14, 0),
          read: true,
        },
        {
          from: 'coach',
          fromName: 'Coach Johnson',
          content: "He's doing really well! His shooting has improved significantly.",
          timestamp: new Date(2026, 0, 7, 15, 30),
          read: true,
        },
        {
          from: 'coach',
          fromName: 'Coach Johnson',
          content: 'Great progress at practice today!',
          timestamp: new Date(2026, 0, 8, 16, 30),
          read: false,
        },
      ],
    },
    {
      coachId: 'coach2',
      coachName: 'Coach Davis',
      lastMessage: 'Tournament schedule attached',
      lastMessageTime: new Date(2026, 0, 5, 10, 0),
      unreadCount: 0,
      conversation: [
        {
          from: 'coach',
          fromName: 'Coach Davis',
          content: 'Tournament schedule attached',
          timestamp: new Date(2026, 0, 5, 10, 0),
          read: true,
        },
      ],
    },
  ],

  // Payments data
  payments: [
    {
      description: 'Winter Season Membership',
      amount: 250.0,
      dueDate: new Date(2026, 0, 15),
      status: 'pending',
      type: 'membership',
    },
    {
      description: 'MLK Tournament Fee',
      amount: 75.0,
      dueDate: new Date(2026, 0, 10),
      status: 'pending',
      type: 'tournament',
    },
    {
      description: 'Fall Season Membership',
      amount: 250.0,
      dueDate: new Date(2025, 8, 1),
      paidDate: new Date(2025, 7, 28),
      status: 'paid',
      type: 'membership',
      receiptUrl: '#',
    },
    {
      description: 'Team Jersey',
      amount: 45.0,
      dueDate: new Date(2025, 7, 15),
      paidDate: new Date(2025, 7, 14),
      status: 'paid',
      type: 'merchandise',
      receiptUrl: '#',
    },
  ],

  // Settings data
  settings: {
    emailNotifications: {
      newMessages: true,
      scheduleUpdates: true,
      paymentReminders: true,
      performanceReports: false,
    },
    pushNotifications: {
      newMessages: true,
      scheduleUpdates: false,
      upcomingEvents: true,
    },
    preferences: {
      theme: 'light',
      language: 'en',
      timezone: 'America/New_York',
    },
  },

  // Athlete data (for dashboard)
  athletes: [
    {
      name: 'John Smith',
      team: 'U15 Boys Basketball',
      number: '23',
      position: 'Guard',
      height: "5'10\"",
      gradYear: '2028',
      photoUrl: 'https://via.placeholder.com/300x400?text=John+Smith',
      status: 'active',
    },
  ],
};

async function seedFirestore() {
  console.log('🌱 Starting Firestore seed...');
  console.log(`User ID: ${TEST_USER_ID}\n`);

  try {
    const db = admin.firestore();

    // Seed Stats
    console.log('📊 Seeding stats...');
    for (const stat of seedData.stats) {
      await db
        .collection('parents')
        .doc(TEST_USER_ID)
        .collection('stats')
        .add({
          ...stat,
          performanceData: stat.performanceData,
          skillBreakdown: stat.skillBreakdown,
          summary: stat.summary,
        });
    }
    console.log('✅ Stats seeded\n');

    // Seed Events
    console.log('📅 Seeding events...');
    for (const event of seedData.events) {
      await db
        .collection('parents')
        .doc(TEST_USER_ID)
        .collection('events')
        .add({
          ...event,
          date: admin.firestore.Timestamp.fromDate(event.date),
        });
    }
    console.log('✅ Events seeded\n');

    // Seed Messages
    console.log('💬 Seeding messages...');
    for (const message of seedData.messages) {
      const conversationRef = await db
        .collection('parents')
        .doc(TEST_USER_ID)
        .collection('messages')
        .add({
          coachId: message.coachId,
          coachName: message.coachName,
          lastMessage: message.lastMessage,
          lastMessageTime: admin.firestore.Timestamp.fromDate(
            message.lastMessageTime
          ),
          unreadCount: message.unreadCount,
        });

      // Add messages to conversation subcollection
      for (const msg of message.conversation) {
        await conversationRef.collection('conversation').add({
          from: msg.from,
          fromName: msg.fromName,
          content: msg.content,
          timestamp: admin.firestore.Timestamp.fromDate(msg.timestamp),
          read: msg.read,
        });
      }
    }
    console.log('✅ Messages seeded\n');

    // Seed Payments
    console.log('💳 Seeding payments...');
    for (const payment of seedData.payments) {
      await db
        .collection('parents')
        .doc(TEST_USER_ID)
        .collection('payments')
        .add({
          ...payment,
          dueDate: admin.firestore.Timestamp.fromDate(payment.dueDate),
          ...(payment.paidDate && {
            paidDate: admin.firestore.Timestamp.fromDate(payment.paidDate),
          }),
        });
    }
    console.log('✅ Payments seeded\n');

    // Seed Settings
    console.log('⚙️ Seeding settings...');
    await db
      .collection('parents')
      .doc(TEST_USER_ID)
      .collection('settings')
      .doc('preferences')
      .set(seedData.settings);
    console.log('✅ Settings seeded\n');

    // Seed Athletes
    console.log('🏀 Seeding athletes...');
    for (const athlete of seedData.athletes) {
      await db
        .collection('parents')
        .doc(TEST_USER_ID)
        .collection('athletes')
        .add(athlete);
    }
    console.log('✅ Athletes seeded\n');

    console.log('🎉 Firestore seed completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`- ${seedData.stats.length} stats entries`);
    console.log(`- ${seedData.events.length} events`);
    console.log(`- ${seedData.messages.length} conversations`);
    console.log(`- ${seedData.payments.length} payments`);
    console.log('- 1 settings document');
    console.log(`- ${seedData.athletes.length} athletes`);
  } catch (error) {
    console.error('❌ Error seeding Firestore:', error);
    throw error;
  }
}

// Run the seed function
// Uncomment to use:
// seedFirestore()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });

// Export for use in other scripts
module.exports = { seedData, seedFirestore, TEST_USER_ID };
