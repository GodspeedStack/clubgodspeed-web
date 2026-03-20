/**
 * Coach Email Service
 * Handles sending training reports and practice info to parents
 * * Note: Email sending requires Resend API key configured in .env
 * The API key should be exposed to the client for direct calls, or
 * use a backend API endpoint for better security.
 */

/**
 * Get parent email address for an athlete
 * @param {string} athleteId - Athlete ID
 * @returns {Promise<string|null>} Parent email address
 */
async function getParentEmail(athleteId) {
 const db = getDB();
 const supabase = window.auth?.getSupabaseClient?.();
 // Try to get from roster (localStorage)
 const athlete = db.roster?.find(a => a.athleteId === athleteId);
 if (athlete?.parentId) {
 return athlete.parentId;
 }
 // Try Supabase
 if (supabase && window.auth?.isSupabaseAvailable?.()) {
 try {
 // Get training purchases for this athlete to find parent
 const { data: purchases } = await supabase
 .from('training_purchases')
 .select('parent_id, parent_accounts(email)')
 .eq('athlete_id', athleteId)
 .limit(1)
 .single();
 if (purchases?.parent_accounts?.email) {
 return purchases.parent_accounts.email;
 }
 } catch (error) {
 console.error('Error fetching parent email from Supabase:', error);
 }
 }
 return null;
}

/**
 * Get training data for an athlete
 * @param {string} athleteId - Athlete ID
 * @returns {Promise<Object>} Training data
 */
async function getTrainingData(athleteId) {
 const supabase = window.auth?.getSupabaseClient?.();
 const db = getDB();
 let trainingData = {
 hoursPurchased: 0,
 hoursUsed: 0,
 hoursRemaining: 0,
 attendance: [],
 sessions: []
 };
 if (supabase && window.auth?.isSupabaseAvailable?.()) {
 try {
 // Get purchases
 const { data: purchases } = await supabase
 .from('training_purchases')
 .select('*, parent_accounts(email)')
 .eq('athlete_id', athleteId)
 .eq('status', 'active');
 if (purchases && purchases.length > 0) {
 trainingData.hoursPurchased = purchases.reduce((sum, p) => sum + parseFloat(p.hours_purchased || 0), 0);
 trainingData.hoursUsed = purchases.reduce((sum, p) => sum + parseFloat(p.hours_used || 0), 0);
 trainingData.hoursRemaining = trainingData.hoursPurchased - trainingData.hoursUsed;
 // Get attendance records
 const purchaseIds = purchases.map(p => p.id);
 const { data: attendance } = await supabase
 .from('training_attendance')
 .select('*, training_sessions(*)')
 .in('purchase_id', purchaseIds)
 .order('attended_at', { ascending: false })
 .limit(10);
 if (attendance) {
 trainingData.attendance = attendance;
 }
 }
 // Get upcoming sessions
 const { data: sessions } = await supabase
 .from('training_sessions')
 .select('*')
 .gte('session_date', new Date().toISOString().split('T')[0])
 .eq('status', 'scheduled')
 .order('session_date', { ascending: true })
 .limit(5);
 if (sessions) {
 trainingData.sessions = sessions;
 }
 } catch (error) {
 console.error('Error fetching training data:', error);
 }
 }
 return trainingData;
}

/**
 * Get practice data for an athlete
 * @param {string} athleteId - Athlete ID
 * @returns {Promise<Object>} Practice data
 */
async function getPracticeData(athleteId) {
 const db = getDB();
 // Get practice grades from localStorage
 const practiceGrades = (db.grades || [])
 .filter(g => g.athleteId === athleteId && g.scores)
 .sort((a, b) => new Date(b.date || b.gradeId) - new Date(a.date || a.gradeId))
 .slice(0, 10); // Last 10 practices
 // Calculate average
 const avgScore = practiceGrades.length > 0
 ? (practiceGrades.reduce((sum, g) => sum + (g.scores?.avg || 0), 0) / practiceGrades.length).toFixed(2)
 : 'N/A';
 return {
 grades: practiceGrades,
 averageScore: avgScore,
 totalPractices: practiceGrades.length
 };
}

/**
 * Generate training report HTML email
 * @param {string} playerName - Player name
 * @param {Object} trainingData - Training data
 * @param {string} coachNotes - Coach feedback/notes
 * @returns {string} HTML email content
 */
function generateTrainingReportEmail(playerName, trainingData, coachNotes = '') {
 const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
 return `
<!DOCTYPE html>
<html>
<head>
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>Training Report - ${playerName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f7;">
 <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f7; padding: 40px 20px;">
 <tr>
 <td align="center">
 <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
 <!-- Header -->
 <tr>
 <td style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 40px 30px; text-align: center;">
 <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.02em;">GODSPEED BASKETBALL</h1>
 <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">Training Report</p>
 </td>
 </tr>
 <!-- Content -->
 <tr>
 <td style="padding: 40px 30px;">
 <h2 style="margin: 0 0 10px 0; color: #111827; font-size: 24px; font-weight: 700;">${playerName}</h2>
 <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 14px;">Report Date: ${reportDate}</p>
 <!-- Hours Summary -->
 <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
 <h3 style="margin: 0 0 15px 0; color: #111827; font-size: 18px; font-weight: 600;">Training Hours Summary</h3>
 <table width="100%" cellpadding="0" cellspacing="0">
 <tr>
 <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Hours Purchased:</td>
 <td align="right" style="padding: 8px 0; color: #111827; font-size: 16px; font-weight: 600;">${trainingData.hoursPurchased.toFixed(1)}</td>
 </tr>
 <tr>
 <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Hours Used:</td>
 <td align="right" style="padding: 8px 0; color: #111827; font-size: 16px; font-weight: 600;">${trainingData.hoursUsed.toFixed(1)}</td>
 </tr>
 <tr style="border-top: 2px solid #e5e7eb;">
 <td style="padding: 12px 0 8px 0; color: #111827; font-size: 16px; font-weight: 700;">Hours Remaining:</td>
 <td align="right" style="padding: 12px 0 8px 0; color: #2563eb; font-size: 20px; font-weight: 700;">${trainingData.hoursRemaining.toFixed(1)}</td>
 </tr>
 </table>
 </div>
 <!-- Attendance -->
 ${trainingData.attendance.length > 0 ? `
 <div style="margin-bottom: 30px;">
 <h3 style="margin: 0 0 15px 0; color: #111827; font-size: 18px; font-weight: 600;">Recent Attendance</h3>
 <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
 ${trainingData.attendance.slice(0, 5).map(att => {
 const session = att.training_sessions;
 const date = session?.session_date ? new Date(session.session_date).toLocaleDateString() : 'N/A';
 return `
 <tr style="border-bottom: 1px solid #e5e7eb;">
 <td style="padding: 12px 0; color: #111827; font-size: 14px;">${date}</td>
 <td style="padding: 12px 0; color: #6b7280; font-size: 14px;">${session?.title || 'Training Session'}</td>
 <td align="right" style="padding: 12px 0; color: #059669; font-size: 14px; font-weight: 600;">${att.hours_used} hrs</td>
 </tr>
 `;
 }).join('')}
 </table>
 </div>
 ` : ''}
 <!-- Coach Notes -->
 ${coachNotes ? `
 <div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 20px; border-radius: 4px; margin-bottom: 30px;">
 <h3 style="margin: 0 0 10px 0; color: #1e3a8a; font-size: 16px; font-weight: 600;">Coach's Notes</h3>
 <p style="margin: 0; color: #1d4ed8; font-size: 14px; line-height: 1.6;">${coachNotes}</p>
 </div>
 ` : ''}
 <!-- Upcoming Sessions -->
 ${trainingData.sessions.length > 0 ? `
 <div style="margin-bottom: 30px;">
 <h3 style="margin: 0 0 15px 0; color: #111827; font-size: 18px; font-weight: 600;">Upcoming Sessions</h3>
 <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
 ${trainingData.sessions.map(session => {
 const date = new Date(session.session_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
 const time = session.start_time ? new Date(`2000-01-01T${session.start_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
 return `
 <tr style="border-bottom: 1px solid #e5e7eb;">
 <td style="padding: 12px 0; color: #111827; font-size: 14px; font-weight: 600;">${date}</td>
 <td style="padding: 12px 0; color: #6b7280; font-size: 14px;">${session.title}</td>
 <td align="right" style="padding: 12px 0; color: #6b7280; font-size: 14px;">${time}</td>
 </tr>
 `;
 }).join('')}
 </table>
 </div>
 ` : ''}
 <!-- CTA Button -->
 <div style="text-align: center; margin-top: 40px;">
 <a href="https://clubgodspeed.com/parent-portal.html" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">View Full Report in Parent Portal</a>
 </div>
 </td>
 </tr>
 <!-- Footer -->
 <tr>
 <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
 <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px;">Godspeed Basketball Academy</p>
 <p style="margin: 0; color: #9ca3af; font-size: 11px;">
 <a href="#" style="color: #6b7280; text-decoration: none;">Unsubscribe</a> | <a href="#" style="color: #6b7280; text-decoration: none;">Email Preferences</a>
 </p>
 </td>
 </tr>
 </table>
 </td>
 </tr>
 </table>
</body>
</html>
 `;
}

/**
 * Generate practice info HTML email
 * @param {string} playerName - Player name
 * @param {Object} practiceData - Practice data
 * @returns {string} HTML email content
 */
function generatePracticeInfoEmail(playerName, practiceData) {
 const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
 return `
<!DOCTYPE html>
<html>
<head>
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>Practice Report - ${playerName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f7;">
 <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f7; padding: 40px 20px;">
 <tr>
 <td align="center">
 <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
 <!-- Header -->
 <tr>
 <td style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 40px 30px; text-align: center;">
 <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.02em;">GODSPEED BASKETBALL</h1>
 <p style="margin: 10px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">Practice Performance Report</p>
 </td>
 </tr>
 <!-- Content -->
 <tr>
 <td style="padding: 40px 30px;">
 <h2 style="margin: 0 0 10px 0; color: #111827; font-size: 24px; font-weight: 700;">${playerName}</h2>
 <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 14px;">Report Date: ${reportDate}</p>
 <!-- Average Score -->
 <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 30px; text-align: center;">
 <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Average Practice Score</p>
 <p style="margin: 0; color: #2563eb; font-size: 48px; font-weight: 700; letter-spacing: -0.05em;">${practiceData.averageScore}</p>
 <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 12px;">Based on ${practiceData.totalPractices} practice${practiceData.totalPractices !== 1 ? 's' : ''}</p>
 </div>
 <!-- Practice Grades -->
 ${practiceData.grades.length > 0 ? `
 <div style="margin-bottom: 30px;">
 <h3 style="margin: 0 0 15px 0; color: #111827; font-size: 18px; font-weight: 600;">Recent Practice Performance</h3>
 <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
 ${practiceData.grades.map(grade => {
 const date = grade.date ? new Date(grade.date).toLocaleDateString() : (grade.gradeId || 'Recent');
 const avgScore = grade.scores?.avg?.toFixed(2) || 'N/A';
 const effort = grade.scores?.effort?.toFixed(1) || 'N/A';
 const comp = grade.scores?.comp?.toFixed(1) || 'N/A';
 const notes = grade.notes || '';
 return `
 <tr style="border-bottom: 1px solid #e5e7eb;">
 <td style="padding: 16px 0;">
 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
 <span style="color: #111827; font-size: 14px; font-weight: 600;">${date}</span>
 <span style="color: #2563eb; font-size: 18px; font-weight: 700;">${avgScore}</span>
 </div>
 <div style="display: flex; gap: 16px; margin-bottom: 4px;">
 <span style="color: #6b7280; font-size: 12px;">Effort: <strong>${effort}</strong></span>
 <span style="color: #6b7280; font-size: 12px;">Comp: <strong>${comp}</strong></span>
 </div>
 ${notes ? `<p style="margin: 4px 0 0 0; color: #6b7280; font-size: 12px; font-style: italic;">${notes}</p>` : ''}
 </td>
 </tr>
 `;
 }).join('')}
 </table>
 </div>
 ` : '<p style="color: #6b7280; font-size: 14px;">No practice data available yet.</p>'}
 <!-- CTA Button -->
 <div style="text-align: center; margin-top: 40px;">
 <a href="https://clubgodspeed.com/parent-portal.html" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">View Full Practice History</a>
 </div>
 </td>
 </tr>
 <!-- Footer -->
 <tr>
 <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
 <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 12px;">Godspeed Basketball Academy</p>
 <p style="margin: 0; color: #9ca3af; font-size: 11px;">
 <a href="#" style="color: #6b7280; text-decoration: none;">Unsubscribe</a> | <a href="#" style="color: #6b7280; text-decoration: none;">Email Preferences</a>
 </p>
 </td>
 </tr>
 </table>
 </td>
 </tr>
 </table>
</body>
</html>
 `;
}

/**
 * Send training report email to parent
 * @param {string} athleteId - Athlete ID
 * @param {string} coachNotes - Optional coach notes/feedback
 * @returns {Promise<Object>} Result with success status
 */
async function sendTrainingReport(athleteId, coachNotes = '') {
 try {
 const db = getDB();
 const athlete = db.roster?.find(a => a.athleteId === athleteId);
 if (!athlete) {
 return { success: false, error: 'Athlete not found' };
 }
 const parentEmail = await getParentEmail(athleteId);
 if (!parentEmail) {
 return { success: false, error: 'Parent email not found' };
 }
 const trainingData = await getTrainingData(athleteId);
 const emailHtml = generateTrainingReportEmail(athlete.name, trainingData, coachNotes);
 // Note: In production, this should call an API endpoint that uses Resend
 // For now, we'll create a function that can be called from the backend
 // or we can use a client-side approach if Resend allows it
 // Check if Resend is available (would need to be loaded)
 if (typeof window.sendEmailViaAPI === 'function') {
 const result = await window.sendEmailViaAPI({
 to: parentEmail,
 subject: `Training Report: ${athlete.name} - ${new Date().toLocaleDateString()}`,
 html: emailHtml
 });
 return { success: true, emailId: result?.id };
 } else {
 // Fallback: return the email data for manual sending or API call
 return {
 success: true,
 emailData: {
 to: parentEmail,
 subject: `Training Report: ${athlete.name} - ${new Date().toLocaleDateString()}`,
 html: emailHtml,
 from: 'Godspeed Basketball <notifications@godspeedbasketball.com>'
 },
 note: 'Email data prepared. Call API endpoint to send.'
 };
 }
 } catch (error) {
 console.error('Error sending training report:', error);
 return { success: false, error: error.message };
 }
}

/**
 * Send practice info email to parent
 * @param {string} athleteId - Athlete ID
 * @returns {Promise<Object>} Result with success status
 */
async function sendPracticeInfo(athleteId) {
 try {
 const db = getDB();
 const athlete = db.roster?.find(a => a.athleteId === athleteId);
 if (!athlete) {
 return { success: false, error: 'Athlete not found' };
 }
 const parentEmail = await getParentEmail(athleteId);
 if (!parentEmail) {
 return { success: false, error: 'Parent email not found' };
 }
 const practiceData = await getPracticeData(athleteId);
 const emailHtml = generatePracticeInfoEmail(athlete.name, practiceData);
 // Check if Resend is available
 if (typeof window.sendEmailViaAPI === 'function') {
 const result = await window.sendEmailViaAPI({
 to: parentEmail,
 subject: `Practice Report: ${athlete.name} - ${new Date().toLocaleDateString()}`,
 html: emailHtml
 });
 return { success: true, emailId: result?.id };
 } else {
 // Fallback: return the email data
 return {
 success: true,
 emailData: {
 to: parentEmail,
 subject: `Practice Report: ${athlete.name} - ${new Date().toLocaleDateString()}`,
 html: emailHtml,
 from: 'Godspeed Basketball <notifications@godspeedbasketball.com>'
 },
 note: 'Email data prepared. Call API endpoint to send.'
 };
 }
 } catch (error) {
 console.error('Error sending practice info:', error);
 return { success: false, error: error.message };
 }
}

/**
 * Send bulk training reports to all parents in a team
 * @param {string} teamId - Team ID
 * @returns {Promise<Object>} Result with success status and count
 */
async function sendBulkTrainingReports(teamId) {
 const db = getDB();
 const teamAthletes = db.roster?.filter(a => a.teamId === teamId) || [];
 const results = [];
 for (const athlete of teamAthletes) {
 const result = await sendTrainingReport(athlete.athleteId);
 results.push({ athleteId: athlete.athleteId, athleteName: athlete.name, ...result });
 }
 const successCount = results.filter(r => r.success).length;
 return {
 success: successCount > 0,
 total: teamAthletes.length,
 successCount,
 results
 };
}

/**
 * Send bulk practice info to all parents in a team
 * @param {string} teamId - Team ID
 * @returns {Promise<Object>} Result with success status and count
 */
async function sendBulkPracticeInfo(teamId) {
 const db = getDB();
 const teamAthletes = db.roster?.filter(a => a.teamId === teamId) || [];
 const results = [];
 for (const athlete of teamAthletes) {
 const result = await sendPracticeInfo(athlete.athleteId);
 results.push({ athleteId: athlete.athleteId, athleteName: athlete.name, ...result });
 }
 const successCount = results.filter(r => r.success).length;
 return {
 success: successCount > 0,
 total: teamAthletes.length,
 successCount,
 results
 };
}

// Export functions for use in coach portal
if (typeof window !== 'undefined') {
 window.coachEmailService = {
 sendTrainingReport,
 sendPracticeInfo,
 sendBulkTrainingReports,
 sendBulkPracticeInfo,
 getParentEmail,
 getTrainingData,
 getPracticeData
 };
}

// For Node.js/ES modules
if (typeof module !== 'undefined' && module.exports) {
 module.exports = {
 sendTrainingReport,
 sendPracticeInfo,
 sendBulkTrainingReports,
 sendBulkPracticeInfo,
 getParentEmail,
 getTrainingData,
 getPracticeData,
 generateTrainingReportEmail,
 generatePracticeInfoEmail
 };
}
