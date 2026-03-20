
import { db, collection, addDoc } from "./firebase.js";

// Form Submission Handler
export async function submitContactForm(event) {
 event.preventDefault();

 const form = event.target;
 const submitBtn = form.querySelector('button[type="submit"]');
 const originalText = submitBtn.innerText;

 submitBtn.innerText = "Sending...";
 submitBtn.disabled = true;

 // Harvest Data
 const formData = new FormData(form);
 const data = {};
 formData.forEach((value, key) => data[key] = value);

 // Add Timestamp
 data.timestamp = new Date().toISOString();

 try {
 if (db) {
 await addDoc(collection(db, "contacts"), data);
 godspeedAlert("Message sent securely! We will be in touch.", "GODSPEED BASKETBALL");
 } else {
 // Fallback for simulation/no-keys
 console.log("Simulated Backend Submission:", data);
 await new Promise(r => setTimeout(r, 1000));
 godspeedAlert("Message sent! (Simulation Mode)", "GODSPEED BASKETBALL");
 }

 form.reset();
 closeContactModal(); // Assumes global function from script.js

 } catch (e) {
 console.error("Error sending message: ", e);
 godspeedAlert("Error sending message. Please email us directly.", "Error");
 } finally {
 submitBtn.innerText = originalText;
 submitBtn.disabled = false;
 }
}

// Global Attach (to allow onclick="startBackend()")
window.submitContactForm = submitContactForm;

// =====================================================
// TRAINING API ENDPOINTS
// =====================================================

/**
 * Get training hours for a parent
 * @param {string} parentEmail - Parent email address
 * @returns {Promise<Object>} Hours data
 */
window.getTrainingHours = async function(parentEmail) {
 const supabase = window.auth?.getSupabaseClient?.();
 if (!supabase || !window.auth?.isSupabaseAvailable?.()) {
 // Fallback to localStorage
 return calculateRemainingHours(parentEmail);
 }

 try {
 const { data: parentAccount } = await supabase
 .from('parent_accounts')
 .select('id')
 .eq('email', parentEmail)
 .single();

 if (!parentAccount) {
 throw new Error('Parent account not found');
 }

 const { data: purchases, error } = await supabase
 .from('training_purchases')
 .select('hours_purchased, hours_used, hours_remaining, status')
 .eq('parent_id', parentAccount.id)
 .eq('status', 'active');

 if (error) throw error;

 const totalPurchased = purchases.reduce((sum, p) => sum + parseFloat(p.hours_purchased || 0), 0);
 const totalUsed = purchases.reduce((sum, p) => sum + parseFloat(p.hours_used || 0), 0);
 const remaining = totalPurchased - totalUsed;
 const progressPercent = totalPurchased > 0 ? (totalUsed / totalPurchased) * 100 : 0;

 return {
 purchased: totalPurchased,
 used: totalUsed,
 remaining: remaining,
 progressPercent: progressPercent
 };
 } catch (error) {
 console.error('Error fetching training hours:', error);
 // Fallback
 return calculateRemainingHours(parentEmail);
 }
};

/**
 * Get training sessions for an athlete
 * @param {string} athleteId - Athlete ID
 * @returns {Promise<Array>} Training sessions
 */
window.getTrainingSessions = async function(athleteId) {
 const supabase = window.auth?.getSupabaseClient?.();
 if (!supabase || !window.auth?.isSupabaseAvailable?.()) {
 return [];
 }

 try {
 // Get athlete's enrollments
 const { data: enrollments } = await supabase
 .from('player_enrollments')
 .select('program_id, enrolled_sessions')
 .eq('athlete_id', athleteId)
 .eq('status', 'active');

 if (!enrollments || enrollments.length === 0) {
 return [];
 }

 const programIds = enrollments.map(e => e.program_id);

 // Get sessions for enrolled programs
 const { data: sessions, error } = await supabase
 .from('training_sessions')
 .select('*')
 .in('program_id', programIds)
 .gte('session_date', new Date().toISOString().split('T')[0])
 .eq('status', 'scheduled')
 .order('session_date', { ascending: true });

 if (error) throw error;

 return sessions || [];
 } catch (error) {
 console.error('Error fetching training sessions:', error);
 return [];
 }
};

/**
 * Get attendance history for an athlete
 * @param {string} athleteId - Athlete ID
 * @returns {Promise<Array>} Attendance records
 */
window.getTrainingAttendance = async function(athleteId) {
 const supabase = window.auth?.getSupabaseClient?.();
 if (!supabase || !window.auth?.isSupabaseAvailable?.()) {
 return [];
 }

 try {
 // Get purchases for athlete
 const { data: purchases } = await supabase
 .from('training_purchases')
 .select('id')
 .eq('athlete_id', athleteId);

 if (!purchases || purchases.length === 0) {
 return [];
 }

 const purchaseIds = purchases.map(p => p.id);

 // Get attendance records
 const { data: attendance, error } = await supabase
 .from('training_attendance')
 .select('*, training_sessions(*), training_purchases(*)')
 .in('purchase_id', purchaseIds)
 .order('attended_at', { ascending: false })
 .limit(50);

 if (error) throw error;

 return attendance || [];
 } catch (error) {
 console.error('Error fetching attendance:', error);
 return [];
 }
};

/**
 * Record a new training purchase
 * @param {Object} purchaseData - Purchase data
 * @returns {Promise<Object>} Created purchase
 */
window.createTrainingPurchase = async function(purchaseData) {
 const supabase = window.auth?.getSupabaseClient?.();
 if (!supabase || !window.auth?.isSupabaseAvailable?.()) {
 // Fallback to localStorage
 const db = getDB();
 if (!db.transactions) db.transactions = [];
 const transaction = {
 id: 'TXN-' + Date.now(),
 ...purchaseData,
 date: new Date().toISOString(),
 status: 'PAID'
 };
 db.transactions.push(transaction);
 saveDB(db);
 return transaction;
 }

 try {
 const { data: parentAccount } = await supabase
 .from('parent_accounts')
 .select('id')
 .eq('email', purchaseData.parentEmail)
 .single();

 if (!parentAccount) {
 throw new Error('Parent account not found');
 }

 const { data, error } = await supabase
 .from('training_purchases')
 .insert({
 parent_id: parentAccount.id,
 athlete_id: purchaseData.athleteId,
 package_id: purchaseData.packageId,
 transaction_id: purchaseData.transactionId,
 hours_purchased: purchaseData.hoursPurchased,
 price_paid: purchaseData.pricePaid,
 status: 'active'
 })
 .select()
 .single();

 if (error) throw error;

 // Create receipt
 await createReceipt(parentAccount.id, data.id, purchaseData);

 return data;
 } catch (error) {
 console.error('Error creating training purchase:', error);
 throw error;
 }
};

/**
 * Create receipt for a purchase
 * @private
 */
async function createReceipt(parentId, purchaseId, purchaseData) {
 const supabase = window.auth?.getSupabaseClient?.();
 if (!supabase) return;

 try {
 // Generate receipt number using the database function
 const { data: receiptNumber, error: rpcError } = await supabase.rpc('generate_receipt_number');
 if (rpcError) {
 // Fallback: generate receipt number manually
 const fallbackNumber = 'RCP-' + new Date().toISOString().split('T')[0].replace(/-/g, '') + '-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
 const { error } = await supabase
 .from('receipts')
 .insert({
 parent_id: parentId,
 transaction_id: purchaseData.transactionId,
 purchase_id: purchaseId,
 receipt_number: fallbackNumber,
 amount: purchaseData.pricePaid,
 payment_method: purchaseData.paymentMethod || 'Credit Card',
 payment_date: new Date().toISOString(),
 items: purchaseData.items || []
 });

 if (error) throw error;
 } else {
 const { error } = await supabase
 .from('receipts')
 .insert({
 parent_id: parentId,
 transaction_id: purchaseData.transactionId,
 purchase_id: purchaseId,
 receipt_number: receiptNumber,
 amount: purchaseData.pricePaid,
 payment_method: purchaseData.paymentMethod || 'Credit Card',
 payment_date: new Date().toISOString(),
 items: purchaseData.items || []
 });

 if (error) throw error;
 }
 } catch (error) {
 console.error('Error creating receipt:', error);
 }
}

/**
 * Helper function for fallback hours calculation
 */
function calculateRemainingHours(parentEmail) {
 const db = getDB();
 const transactions = (db.transactions || []).filter(t => t.parentId === parentEmail && t.status === 'PAID'
 );
 let totalPurchased = 0;
 transactions.forEach(txn => {
 const hoursInPackage = txn.hoursPurchased || (txn.amount / 50);
 totalPurchased += hoursInPackage;
 });
 return {
 purchased: totalPurchased,
 used: 0,
 remaining: totalPurchased,
 progressPercent: 0
 };
}
