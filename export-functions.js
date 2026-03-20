/**
 * Training Data Export Functions
 * V1 - Make all Training tab links functional
 */

// CSV Export Helper Function
function downloadCSV(data, filename) {
 const csv = arrayToCSV(data);
 const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
 const link = document.createElement('a');
 link.href = URL.createObjectURL(blob);
 link.download = filename;
 link.click();
}

function arrayToCSV(data) {
 if (!data || data.length === 0) return '';

 const headers = Object.keys(data[0]);
 const rows = data.map(row =>
 headers.map(header => {
 const value = String(row[header] || '');
 // Escape quotes and wrap in quotes if contains comma
 return value.includes(',') || value.includes('"')
 ? `"${value.replace(/"/g, '""')}"`
 : value;
 }).join(',')
 );

 return [headers.join(','), ...rows].join('\n');
}

// Show Receipts List Modal
function showReceiptsList() {
 const email = localStorage.getItem('gba_user_email');
 const db = getDB();
 const userRecords = db.trainingRecords ? db.trainingRecords[email] : null;
 const purchases = userRecords ? userRecords.purchases : [];

 // Create modal
 const modalHTML = `
 <div style="max-width: 600px; max-height: 70vh; overflow-y: auto;">
 <h3 style="margin-bottom: 20px;">All Receipts</h3>
 <div style="margin-bottom: 16px; display: flex; justify-content: flex-end;">
 <button onclick="exportReceiptsCSV()" class="btn-primary" style="padding: 8px 16px;">
 Download CSV
 </button>
 </div>
 <div class="receipts-list">
 ${purchases.map(receipt => `
 <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #e5e7eb;">
 <div>
 <div style="font-weight: 600;">Receipt: ${escapeHTML(receipt.item)}</div>
 <div style="font-size: 12px; color: #666;">${escapeHTML(receipt.date)} • ${escapeHTML(receipt.status)}</div>
 </div>
 <div style="display: flex; gap: 8px;">
 <span style="font-weight: 600; margin-right: 8px;">${escapeHTML(receipt.amount)}</span>
 <button onclick="viewReceiptPDF('${escapeHTML(receipt.id)}')" class="btn-secondary" style="padding: 4px 12px; font-size: 12px;">View Receipt</button>
 <button onclick="downloadReceiptPDF('${escapeHTML(receipt.id)}')" class="btn-primary" style="padding: 4px 12px; font-size: 12px;">Download PDF</button>
 </div>
 </div>
 `).join('')}
 </div>
 </div>
 `;

 godspeedAlert(modalHTML, 'Info');
}

// Show Invoices List Modal
function showInvoicesList() {
 godspeedAlert('<div style="text-align: center; padding: 20px;">No invoices found.</div>', 'Info');
}

// Export Receipts as CSV
function exportReceiptsCSV() {
 const email = localStorage.getItem('gba_user_email');
 const db = getDB();
 const userRecords = db.trainingRecords ? db.trainingRecords[email] : null;
 const purchases = userRecords ? userRecords.purchases : [];

 const csvData = purchases.map(p => ({
 'Receipt ID': p.id,
 'Date': p.date,
 'Item': p.item,
 'Amount': p.amount,
 'Status': p.status
 }));

 downloadCSV(csvData, `receipts_${email}_${new Date().toISOString().split('T')[0]}.csv`);
}

// View Receipt PDF (placeholder - will open in modal)
function viewReceiptPDF(receiptId) {
 godspeedAlert(`Receipt PDF viewer for ${receiptId} will be implemented with backend.`, 'Info');
}

// Download Receipt PDF (placeholder - will trigger download)
function downloadReceiptPDF(receiptId) {
 // In production, this will call: // window.open(`/api/documents/receipt/${receiptId}`, '_blank');
 godspeedAlert(`Receipt PDF download for ${receiptId} will be enabled once backend is ready.\n\nWill download from: /api/documents/receipt/${receiptId}`, 'Info');
}

// Export Session History as CSV
function exportSessionHistoryCSV() {
 const email = localStorage.getItem('gba_user_email');
 const db = getDB();
 const userRecords = db.trainingRecords ? db.trainingRecords[email] : null;
 const sessions = userRecords ? userRecords.logs : [];

 const csvData = sessions.map(s => ({
 'Date': s.date,
 'Time': s.time,
 'Duration (hrs)': s.duration,
 'Activity': s.activity,
 'Notes': s.notes,
 'Status': 'Completed'
 }));

 downloadCSV(csvData, `training_sessions_${email}_${new Date().toISOString().split('T')[0]}.csv`);
}

// Make dashboard stats clickable
function showCompletedSessionsList() {
 const email = localStorage.getItem('gba_user_email');
 const db = getDB();
 const userRecords = db.trainingRecords ? db.trainingRecords[email] : null;
 const sessions = userRecords ? userRecords.logs : [];

 const modalHTML = `
 <div style="max-width: 700px; max-height: 70vh; overflow-y: auto;">
 <h3 style="margin-bottom: 20px;">Completed Sessions (${sessions.length})</h3>
 <div style="margin-bottom: 16px; display: flex; justify-content: flex-end;">
 <button onclick="exportSessionHistoryCSV()" class="btn-primary" style="padding: 8px 16px;">
 Download CSV
 </button>
 </div>
 <div class="sessions-list">
 ${sessions.map(session => `
 <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #e5e7eb;">
 <div style="flex: 1;">
 <div style="font-weight: 600;">${escapeHTML(session.activity)}</div>
 <div style="font-size: 12px; color: #666;">${escapeHTML(session.date)} • ${escapeHTML(session.time)}</div>
 <div style="font-size: 12px; color: #888; margin-top: 4px;">${escapeHTML(session.notes || '')}</div>
 </div>
 <div style="text-align: right;">
 <div style="font-weight: 600; color: #10b981;">${session.duration} hrs</div>
 <div style="font-size: 11px; color: #10b981;">✓ Completed</div>
 </div>
 </div>
 `).join('')}
 </div>
 </div>
 `;

 godspeedAlert(modalHTML, 'Info');
}

// Placeholder functions for upcoming features
function showUpcomingSessionsList() {
 godspeedAlert('Upcoming sessions view will be implemented with backend scheduling data.', 'Info');
}

function showActiveProgramsList() {
 godspeedAlert('Active programs view with syllabus download will be implemented with backend data.', 'Info');
}

function generateReceiptPDF(receiptNumber) {
 downloadReceiptPDF(receiptNumber);
}

function generateInvoicePDF(invoiceNumber) {
 godspeedAlert(`Invoice PDF for ${invoiceNumber} will be available once backend is ready.`, 'Info');
}
