/**
 * Receipt View Component
 * Displays receipt details with PDF download functionality
 */

// Show Receipt Detail Modal
function showReceiptDetail(receiptId) {
    // Fetch receipt data
    fetchReceiptData(receiptId)
        .then(receipt => {
            const modalHTML = createReceiptModalHTML(receipt);
            godspeedAlert(modalHTML, 'Info');
        })
        .catch(error => {
            godspeedAlert(`Error loading receipt: ${error.message}`, 'Error');
        });
}

// Fetch receipt data from backend
async function fetchReceiptData(receiptId) {
    // V1: Using mock data from portal-data.js
    // V2: Replace with actual API call
    const email = localStorage.getItem('gba_user_email');
    const db = getDB();
    const userRecords = db.trainingRecords ? db.trainingRecords[email] : null;

    if (!userRecords || !userRecords.purchases) {
        throw new Error('Receipt not found');
    }

    const purchase = userRecords.purchases.find(p => p.id === receiptId);
    if (!purchase) {
        throw new Error('Receipt not found');
    }

    // Get parent info (would come from joined query in V2)
    const parentAccount = db.parentAccounts ? db.parentAccounts.find(p => p.email === email) : null;

    // Mock athlete info (would come from joined query in V2)
    const athlete = { name: 'Anton' }; // From portal-data context

    return {
        id: purchase.id,
        receiptNumber: purchase.id,
        paymentDate: purchase.date,
        status: purchase.status,
        amount: purchase.amount,
        item: purchase.item,
        pdfUrl: null, // Not yet generated
        parent: {
            name: parentAccount?.name || 'Denis (Anton\'s Dad)',
            email: email,
            phone: parentAccount?.phone || '(555) 666-7777'
        },
        athlete: {
            name: athlete.name
        }
    };
}

// Create Receipt Modal HTML
function createReceiptModalHTML(receipt) {
    return `
        <div style="max-width: 600px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 32px;">
                <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px; color: #111;">Receipt</h2>
                <div style="font-size: 14px; color: #6b7280;">Receipt #${escapeHTML(receipt.receiptNumber)}</div>
            </div>
            
            <!-- Status Badge -->
            <div style="text-align: center; margin-bottom: 24px;">
                <span style="
                    display: inline-block;
                    padding: 6px 16px;
                    border-radius: 20px;
                    font-size: 13px;
                    font-weight: 600;
                    ${receipt.status === 'Paid' ? 'background: #ecfdf5; color: #059669;' :
            receipt.status === 'Refunded' ? 'background: #fef2f2; color: #dc2626;' :
                'background: #fef3c7; color: #d97706;'}
                ">
                    ${escapeHTML(receipt.status)}
                </span>
            </div>
            
            <!-- Details Card -->
            <div style="
                background: #f9fafb;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 20px;
            ">
                <!-- Payment Date -->
                <div style="display: flex; justify-content: space-between; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb;">
                    <div style="font-size: 14px; color: #6b7280;">Payment Date</div>
                    <div style="font-size: 14px; font-weight: 600; color: #111;">${escapeHTML(receipt.paymentDate)}</div>
                </div>
                
                <!-- Parent Info -->
                <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb;">
                    <div style="font-size: 13px; color: #6b7280; margin-bottom: 8px; text-transform: uppercase; font-weight: 500;">Billed To</div>
                    <div style="font-size: 14px; font-weight: 600; color: #111; margin-bottom: 4px;">${escapeHTML(receipt.parent.name)}</div>
                    <div style="font-size: 13px; color: #6b7280;">${escapeHTML(receipt.parent.email)}</div>
                    ${receipt.parent.phone ? `<div style="font-size: 13px; color: #6b7280;">${escapeHTML(receipt.parent.phone)}</div>` : ''}
                </div>
                
                <!-- Athlete Info -->
                <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb;">
                    <div style="font-size: 13px; color: #6b7280; margin-bottom: 8px; text-transform: uppercase; font-weight: 500;">Athlete</div>
                    <div style="font-size: 14px; font-weight: 600; color: #111;">${escapeHTML(receipt.athlete.name)}</div>
                </div>
                
                <!-- Item Description -->
                <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb;">
                    <div style="font-size: 13px; color: #6b7280; margin-bottom: 8px; text-transform: uppercase; font-weight: 500;">Item</div>
                    <div style="font-size: 14px; color: #111;">${escapeHTML(receipt.item)}</div>
                </div>
                
                <!-- Amount -->
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 16px; font-weight: 600; color: #111;">Total Paid</div>
                    <div style="font-size: 24px; font-weight: 700; color: #2563eb;">${escapeHTML(receipt.amount)}</div>
                </div>
            </div>
            
            <!-- Action Buttons -->
            <div style="display: flex; gap: 12px;">
                <button 
                    onclick="downloadReceiptPDF('${escapeHTML(receipt.id)}')" 
                    class="btn-primary" 
                    style="flex: 1; padding: 14px; border-radius: 10px; font-size: 15px; font-weight: 600;">
                    Download PDF
                </button>
                <button 
                    onclick="viewReceiptPDF('${escapeHTML(receipt.id)}')" 
                    class="btn-secondary" 
                    style="flex: 1; padding: 14px; border-radius: 10px; font-size: 15px; font-weight: 600; background: white; border: 1px solid #e5e7eb; color: #111;">
                    Open PDF
                </button>
            </div>
            
            <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #9ca3af;">
                Questions? Contact us at support@clubgodspeed.com
            </div>
        </div>
    `;
}

// Update showReceiptsList to use new detail view
function showReceiptsListV2() {
    const email = localStorage.getItem('gba_user_email');
    const db = getDB();
    const userRecords = db.trainingRecords ? db.trainingRecords[email] : null;
    const purchases = userRecords ? userRecords.purchases : [];

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
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #e5e7eb; cursor: pointer;" onclick="showReceiptDetail('${escapeHTML(receipt.id)}')">
                        <div>
                            <div style="font-weight: 600;">${escapeHTML(receipt.item)}</div>
                            <div style="font-size: 12px; color: #666;">${escapeHTML(receipt.date)} • ${escapeHTML(receipt.status)}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-weight: 600; color: #2563eb;">${escapeHTML(receipt.amount)}</span>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    godspeedAlert(modalHTML, 'Info');
}
