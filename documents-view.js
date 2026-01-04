/**
 * Documents View - Receipt and Invoice Generation
 * Handles PDF generation for receipts and invoices
 */

// Load jsPDF from CDN if not available
if (typeof window.jspdf === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.head.appendChild(script);
}

/**
 * Generate Receipt PDF
 */
window.generateReceiptPDF = async function(receiptId) {
    const supabase = window.auth?.getSupabaseClient?.();
    const parentEmail = localStorage.getItem('gba_user_email');
    
    if (!parentEmail) {
        alert('Please log in to view receipts');
        return;
    }

    let receiptData = null;

    // Try to fetch from Supabase
    if (supabase && window.auth?.isSupabaseAvailable?.()) {
        try {
            const { data: parentAccount } = await supabase
                .from('parent_accounts')
                .select('id')
                .eq('email', parentEmail)
                .single();

            if (parentAccount) {
                const { data } = await supabase
                    .from('receipts')
                    .select('*')
                    .eq('receipt_number', receiptId)
                    .eq('parent_id', parentAccount.id)
                    .single();

                if (data) receiptData = data;
            }
        } catch (error) {
            console.error('Error fetching receipt:', error);
        }
    }

    // Fallback to localStorage/portal-data
    if (!receiptData) {
        const db = getDB();
        const transaction = (db.transactions || []).find(t => t.id === receiptId);
        if (transaction) {
            receiptData = {
                receipt_number: transaction.id,
                amount: transaction.amount,
                payment_date: transaction.date,
                items: transaction.sessions || [],
                payment_method: 'Credit Card'
            };
        }
    }

    if (!receiptData) {
        alert('Receipt not found');
        return;
    }

    // Generate PDF
    generateReceiptPDFDocument(receiptData);
};

/**
 * Generate Invoice PDF
 */
window.generateInvoicePDF = async function(invoiceNumber) {
    const supabase = window.auth?.getSupabaseClient?.();
    const parentEmail = localStorage.getItem('gba_user_email');
    
    if (!parentEmail) {
        alert('Please log in to view invoices');
        return;
    }

    let invoiceData = null;

    // Try to fetch from Supabase
    if (supabase && window.auth?.isSupabaseAvailable?.()) {
        try {
            const { data: parentAccount } = await supabase
                .from('parent_accounts')
                .select('id')
                .eq('email', parentEmail)
                .single();

            if (parentAccount) {
                const { data } = await supabase
                    .from('invoices')
                    .select('*')
                    .eq('invoice_number', invoiceNumber)
                    .eq('parent_id', parentAccount.id)
                    .single();

                if (data) invoiceData = data;
            }
        } catch (error) {
            console.error('Error fetching invoice:', error);
        }
    }

    if (!invoiceData) {
        alert('Invoice not found');
        return;
    }

    // Generate PDF
    generateInvoicePDFDocument(invoiceData);
};

/**
 * Generate Receipt PDF Document
 */
function generateReceiptPDFDocument(receipt) {
    if (typeof window.jspdf === 'undefined') {
        alert('PDF library not loaded. Please refresh the page.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Receipt Header
    doc.setFontSize(24);
    doc.setTextColor(37, 99, 235); // Blue
    doc.text('GODSPEED BASKETBALL', 20, 30);
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Training Receipt', 20, 40);

    // Receipt Details
    let yPos = 60;
    doc.setFontSize(10);
    doc.text(`Receipt Number: ${receipt.receipt_number}`, 20, yPos);
    yPos += 10;
    doc.text(`Date: ${new Date(receipt.payment_date).toLocaleDateString()}`, 20, yPos);
    yPos += 10;
    doc.text(`Payment Method: ${receipt.payment_method || 'Credit Card'}`, 20, yPos);
    yPos += 20;

    // Items
    doc.setFontSize(12);
    doc.text('Items:', 20, yPos);
    yPos += 10;

    doc.setFontSize(10);
    if (receipt.items && receipt.items.length > 0) {
        receipt.items.forEach((item, index) => {
            const itemText = typeof item === 'string' ? item : (item.name || item.program || 'Training Session');
            doc.text(`${index + 1}. ${itemText}`, 25, yPos);
            yPos += 8;
        });
    } else {
        doc.text('Training Package', 25, yPos);
        yPos += 8;
    }

    yPos += 10;

    // Total
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Total: $${parseFloat(receipt.amount).toFixed(2)}`, 20, yPos);
    yPos += 20;

    // Footer
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(128, 128, 128);
    doc.text('Thank you for your payment!', 20, yPos);
    yPos += 5;
    doc.text('For questions, contact: info@godspeedbasketball.com', 20, yPos);

    // Download
    doc.save(`receipt-${receipt.receipt_number}.pdf`);
}

/**
 * Generate Invoice PDF Document
 */
function generateInvoicePDFDocument(invoice) {
    if (typeof window.jspdf === 'undefined') {
        alert('PDF library not loaded. Please refresh the page.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Invoice Header
    doc.setFontSize(24);
    doc.setTextColor(37, 99, 235); // Blue
    doc.text('GODSPEED BASKETBALL', 20, 30);
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Invoice', 20, 40);

    // Invoice Details
    let yPos = 60;
    doc.setFontSize(10);
    doc.text(`Invoice Number: ${invoice.invoice_number}`, 20, yPos);
    yPos += 10;
    doc.text(`Issue Date: ${new Date(invoice.issue_date).toLocaleDateString()}`, 20, yPos);
    yPos += 10;
    doc.text(`Due Date: ${new Date(invoice.due_date).toLocaleDateString()}`, 20, yPos);
    yPos += 10;
    doc.text(`Status: ${invoice.status.toUpperCase()}`, 20, yPos);
    yPos += 20;

    // Line Items
    doc.setFontSize(12);
    doc.text('Line Items:', 20, yPos);
    yPos += 10;

    doc.setFontSize(10);
    if (invoice.line_items && invoice.line_items.length > 0) {
        invoice.line_items.forEach((item, index) => {
            const itemText = typeof item === 'string' ? item : (item.description || item.name || 'Training Service');
            const itemAmount = typeof item === 'object' && item.amount ? item.amount : (invoice.amount / invoice.line_items.length);
            doc.text(`${index + 1}. ${itemText}`, 25, yPos);
            doc.text(`$${parseFloat(itemAmount).toFixed(2)}`, 170, yPos);
            yPos += 8;
        });
    } else {
        doc.text('Training Services', 25, yPos);
        doc.text(`$${parseFloat(invoice.amount).toFixed(2)}`, 170, yPos);
        yPos += 8;
    }

    yPos += 10;

    // Totals
    doc.setFontSize(10);
    if (invoice.tax_amount && invoice.tax_amount > 0) {
        doc.text(`Subtotal: $${parseFloat(invoice.amount - invoice.tax_amount).toFixed(2)}`, 150, yPos);
        yPos += 8;
        doc.text(`Tax: $${parseFloat(invoice.tax_amount).toFixed(2)}`, 150, yPos);
        yPos += 8;
    }
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Total: $${parseFloat(invoice.total_amount).toFixed(2)}`, 150, yPos);
    yPos += 20;

    // Payment Instructions
    if (invoice.status === 'pending') {
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(200, 0, 0);
        doc.text('Payment Due: Please pay by the due date', 20, yPos);
        yPos += 10;
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text('For questions, contact: info@godspeedbasketball.com', 20, yPos);

    // Download
    doc.save(`invoice-${invoice.invoice_number}.pdf`);
}
