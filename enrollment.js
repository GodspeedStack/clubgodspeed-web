// enrollment.js
// Handles Program Enrollment Flow (iOS Sheet Style + Session Logic)

const PROGRAM_SCHEDULE = [
 { id: 'mon', day: 'Monday', time: '6:00 PM - 8:00 PM' },
 { id: 'tue', day: 'Tuesday', time: '6:00 PM - 8:00 PM' },
 { id: 'wed', day: 'Wednesday', time: '6:00 PM - 8:00 PM' },
 { id: 'thu', day: 'Thursday', time: '6:00 PM - 8:00 PM' },
 { id: 'sun', day: 'Sunday', time: '2:00 PM - 4:00 PM' }
];

let selectedSessions = [];
let currentProgramPrice = 0;

document.addEventListener('DOMContentLoaded', () => {
 initEnrollmentListeners();
});

function initEnrollmentListeners() {
 const buttons = document.querySelectorAll('.add-to-cart-btn');
 buttons.forEach(btn => {
 btn.addEventListener('click', (e) => {
 e.preventDefault();
 handleProgramClick(e.target);
 });
 });
}

function handleProgramClick(btn) {
 // 1. NO Auth Check - Immediate Open
 const programId = btn.dataset.id;
 const programName = btn.dataset.name;
 const price = parseFloat(btn.dataset.price) || 0;

 openEnrollmentModal(programId, programName, price);
}

function openEnrollmentModal(id, name, price) {
 const db = getDB();
 const modal = document.getElementById('enrollment-modal');
 if (!modal) return;

 // Reset State
 document.getElementById('enroll-program-name').innerText = name;
 selectedSessions = []; // Reset selections
 currentProgramPrice = price; // Base price (per session, typically)

 // Render Schedule
 renderSessionList();
 updatePriceButton(); // Initial Update (0 selected)

 // Auth Logic
 const isLoggedIn = window.auth && window.auth.isLoggedIn();
 const guestForm = document.getElementById('enroll-guest-form');
 const athleteSelect = document.getElementById('enroll-athlete-select');

 if (isLoggedIn) {
 // LOGGED IN: Show Athlete Select
 guestForm.style.display = 'none';
 athleteSelect.style.display = 'block';

 const parentEmail = localStorage.getItem('gba_user_email');
 const athletes = (db.roster || []).filter(p => p.parentId === parentEmail);

 const athleteList = document.getElementById('enroll-athlete-list');
 athleteList.innerHTML = '';

 if (athletes.length === 0) {
 athleteList.innerHTML = '<div style="color: #666; padding: 1rem; text-align: center; font-size: 14px;">No linked athletes found. Please add them in the Portal.</div>';
 } else {
 athletes.forEach((athlete, index) => {
 const wrapper = document.createElement('label');
 wrapper.style.display = 'flex';
 wrapper.style.alignItems = 'center';
 wrapper.style.padding = '12px';
 wrapper.style.background = '#f5f5f7';
 wrapper.style.marginBottom = '8px';
 wrapper.style.borderRadius = '12px';
 wrapper.style.cursor = 'pointer';

 const radio = document.createElement('input');
 radio.type = 'radio';
 radio.name = 'enroll-athlete';
 radio.value = athlete.athleteId;
 if (index === 0) radio.checked = true;
 radio.style.marginRight = '12px';
 radio.style.accentColor = '#0071e3';

 const info = document.createElement('div');
 info.innerHTML = `<div style="font-weight: 600; font-size: 15px;">${athlete.name}</div><div style="font-size: 13px; color: #86868b;">${athlete.teamId || 'No Team'}</div>`;

 wrapper.appendChild(radio);
 wrapper.appendChild(info);
 athleteList.appendChild(wrapper);
 });
 }
 } else {
 // GUEST: Show Guest Form
 guestForm.style.display = 'block';
 athleteSelect.style.display = 'none';
 }

 // Show Modal
 modal.classList.add('active');
 document.body.style.overflow = 'hidden';

 // Bind Confirm
 const btn = document.getElementById('btn-confirm-enroll');
 btn.onclick = () => confirmEnrollment(id, name, isLoggedIn);
}

function renderSessionList() {
 const container = document.getElementById('enroll-session-list');
 container.innerHTML = '';

 PROGRAM_SCHEDULE.forEach((session, index) => {
 const item = document.createElement('div');
 item.className = 'ios-radio-card'; // New Card Class
 item.onclick = () => toggleSession(index, item);

 // Check if already selected (persistence)
 if (selectedSessions.some(s => s.id === session.id)) {
 item.classList.add('selected');
 }

 item.innerHTML = `
 <div>
 <div class="ios-card-title">${session.day}</div>
 <div class="ios-card-subtitle">${session.time}</div>
 </div>
 <div class="ios-radio-check"></div>
 `;

 container.appendChild(item);
 });
}

function toggleSession(index, element) {
 const session = PROGRAM_SCHEDULE[index];
 const sessionIndex = selectedSessions.findIndex(s => s.id === session.id);

 // Toggle Class
 element.classList.toggle('selected');

 if (sessionIndex === -1) {
 selectedSessions.push(session);
 } else {
 selectedSessions.splice(sessionIndex, 1);
 }

 updatePriceButton();
}

function updatePriceButton() {
 const btn = document.getElementById('btn-confirm-enroll');
 const count = selectedSessions.length;

 if (count === 0) {
 btn.innerText = `Select Session(s)`;
 btn.style.opacity = '0.5';
 btn.style.pointerEvents = 'none';
 } else {
 const total = count * currentProgramPrice;
 btn.innerText = `Continue to Checkout - $${total}`;
 btn.style.opacity = '1';
 btn.style.pointerEvents = 'auto';
 }
}

function closeEnrollmentModal() {
 const modal = document.getElementById('enrollment-modal');
 if (modal) {
 modal.classList.remove('active');
 document.body.style.overflow = '';
 }
}

function confirmEnrollment(programId, programName, isLoggedIn) {
 const db = getDB();
 const totalPrice = selectedSessions.length * currentProgramPrice;

 let transactionData = {
 id: 'TXN-' + Date.now(),
 date: new Date().toISOString(),
 programId: programId,
 programName: programName,
 amount: totalPrice,
 status: 'PAID',
 sessions: selectedSessions
 };

 if (isLoggedIn) {
 // Logged In Flow
 const selectedAthlete = document.querySelector('input[name="enroll-athlete"]:checked');
 if (!selectedAthlete && document.getElementById('enroll-athlete-list').children.length > 0) {
 alert("Please pick an athlete from the list first.");
 return;
 }

 if (selectedAthlete) {
 const athleteId = selectedAthlete.value;
 transactionData.athleteId = athleteId;
 transactionData.parentId = localStorage.getItem('gba_user_email');

 // Update Roster logic would go here (omitted for brevity, handled similar to before)
 const athleteIndex = db.roster.findIndex(a => a.athleteId === athleteId);
 if (athleteIndex !== -1) {
 if (!db.roster[athleteIndex].active_enrollments) db.roster[athleteIndex].active_enrollments = [];
 // Maybe unique by program + sessions? For now just program.
 if (!db.roster[athleteIndex].active_enrollments.includes(programId)) {
 db.roster[athleteIndex].active_enrollments.push(programId);
 }
 }

 showIOSAlert("Enrollment Confirmed", `Success! Enrollment complete for ${selectedSessions.length} session(s).`, "Done");
 } else {
 alert("Please link an athlete in your portal first.");
 return;
 }

 } else {
 // Guest Flow
 const pName = document.getElementById('guest-parent-name').value.trim();
 const pEmail = document.getElementById('guest-email').value.trim();
 const aName = document.getElementById('guest-athlete-name').value.trim();

 if (!pName || !pEmail || !aName) {
 alert("You missed a spot. Please fill out every box for the guest details.");
 return;
 }

 transactionData.parentId = pEmail;
 transactionData.guestDetails = {
 parentName: pName,
 athleteName: aName
 };

 showIOSAlert("Guest Checkout Complete", `Thanks ${pName}! You've secured ${selectedSessions.length} sessions for ${aName}.`, "OK");
 }

 // Save Transaction
 if (!db.transactions) db.transactions = [];
 db.transactions.push(transactionData);
 saveDB(db);

 closeEnrollmentModal();
}
