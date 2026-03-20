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
window.generateReceiptPDF = async function (receiptId) {
    const supabase = window.auth?.getSupabaseClient?.();
    const parentEmail = localStorage.getItem('gba_user_email');

    if (!parentEmail) {
        godspeedAlert('Please log in to view receipts', 'GODSPEED BASKETBALL');
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
        godspeedAlert('Receipt not found', 'Error');
        return;
    }

    // Generate PDF
    generateReceiptPDFDocument(receiptData);
};

// Function is already globally available as window.generateReceiptPDF

/**
 * Generate Invoice PDF
 */
window.generateInvoicePDF = async function (invoiceNumber) {
    const supabase = window.auth?.getSupabaseClient?.();
    const parentEmail = localStorage.getItem('gba_user_email');

    if (!parentEmail) {
        godspeedAlert('Please log in to view invoices', 'GODSPEED BASKETBALL');
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
        godspeedAlert('Invoice not found', 'Error');
        return;
    }

    // Generate PDF
    generateInvoicePDFDocument(invoiceData);
};

// Function is already globally available as window.generateInvoicePDF

/**
 * Generate Receipt PDF Document
 */
function generateReceiptPDFDocument(receipt) {
    // Wait for jsPDF to load if needed
    if (typeof window.jspdf === 'undefined') {
        // Try loading jsPDF
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = () => {
            if (typeof window.jspdf !== 'undefined') {
                generateReceiptPDFDocument(receipt);
            } else {
                godspeedAlert('PDF library not loaded. Please refresh the page.', 'Error');
            }
        };
        document.head.appendChild(script);
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;

    // Header with branding
    doc.setFillColor(37, 99, 235); // Brand blue
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont(undefined, 'bold');
    doc.text('GODSPEED', margin, 20);
    doc.text('BASKETBALL', margin, 30);

    // Receipt title
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text('TRAINING RECEIPT', pageWidth - margin, 25, { align: 'right' });

    // Receipt Details Section
    let yPos = 55;
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');

    // Receipt number
    doc.setFont(undefined, 'bold');
    doc.text('Receipt Number:', margin, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(receipt.receipt_number || receipt.transaction_id || 'N/A', margin + 50, yPos);
    yPos += 8;

    // Date
    doc.setFont(undefined, 'bold');
    doc.text('Date:', margin, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(new Date(receipt.payment_date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
    }), margin + 50, yPos);
    yPos += 8;

    // Payment method
    doc.setFont(undefined, 'bold');
    doc.text('Payment Method:', margin, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(receipt.payment_method || 'Credit Card', margin + 50, yPos);
    yPos += 15;

    // Items Section
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Items Purchased:', margin, yPos);
    yPos += 10;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    if (receipt.items && receipt.items.length > 0) {
        receipt.items.forEach((item, index) => {
            const itemText = typeof item === 'string' ? item : (item.name || item.program || 'Training Session');
            doc.text(`${index + 1}. ${itemText}`, margin + 5, yPos);
            yPos += 8;
            if (yPos > 250) {
                doc.addPage();
                yPos = 20;
            }
        });
    } else {
        doc.text('1. Training Package', margin + 5, yPos);
        yPos += 8;
    }

    yPos += 10;

    // Total Section
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Total Amount:', margin, yPos);
    doc.setTextColor(37, 99, 235);
    doc.text(`$${parseFloat(receipt.amount).toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 20;

    // Footer
    doc.setTextColor(128, 128, 128);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text('Thank you for your payment!', margin, yPos);
    yPos += 6;
    doc.text('For questions, contact: info@godspeedbasketball.com', margin, yPos);
    yPos += 6;
    doc.text('Denver Basketball Center | Godspeed HQ, Denver, CO', margin, yPos);

    // Download - named for easy filing: GODSPEED_Receipt_[Name]_[ID]_[Date].pdf
    const receiptId = receipt.receipt_number || receipt.transaction_id || 'Unknown';
    const parentName = (receipt.parent_name || localStorage.getItem('gba_user_email') || 'Parent').split('@')[0].replace(/\s+/g, '-');
    const receiptDate = receipt.payment_date ? new Date(receipt.payment_date).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7);
    doc.save(`GODSPEED_Receipt_${parentName}_${receiptId}_${receiptDate}.pdf`);
}

/**
 * Generate Invoice PDF Document
 */
function generateInvoicePDFDocument(invoice) {
    // Wait for jsPDF to load if needed
    if (typeof window.jspdf === 'undefined') {
        // Try loading jsPDF
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = () => {
            if (typeof window.jspdf !== 'undefined') {
                generateInvoicePDFDocument(invoice);
            } else {
                godspeedAlert('PDF library not loaded. Please refresh the page.', 'Error');
            }
        };
        document.head.appendChild(script);
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;

    // Header with branding
    doc.setFillColor(37, 99, 235); // Brand blue
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont(undefined, 'bold');
    doc.text('GODSPEED', margin, 20);
    doc.text('BASKETBALL', margin, 30);

    // Invoice title
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text('INVOICE', pageWidth - margin, 25, { align: 'right' });

    // Invoice Details Section
    let yPos = 55;
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');

    // Invoice number
    doc.setFont(undefined, 'bold');
    doc.text('Invoice Number:', margin, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(invoice.invoice_number || 'N/A', margin + 50, yPos);
    yPos += 8;

    // Issue date
    doc.setFont(undefined, 'bold');
    doc.text('Issue Date:', margin, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(new Date(invoice.issue_date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
    }), margin + 50, yPos);
    yPos += 8;

    // Due date
    doc.setFont(undefined, 'bold');
    doc.text('Due Date:', margin, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(new Date(invoice.due_date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
    }), margin + 50, yPos);
    yPos += 8;

    // Status
    doc.setFont(undefined, 'bold');
    doc.text('Status:', margin, yPos);
    doc.setFont(undefined, 'normal');
    const statusColor = invoice.status === 'paid' ? [16, 185, 129] :
        invoice.status === 'overdue' ? [239, 68, 68] :
            [245, 158, 11];
    doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.text(invoice.status.toUpperCase(), margin + 50, yPos);
    yPos += 15;

    // Line Items Section
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Line Items:', margin, yPos);
    yPos += 10;

    // Table header
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('Description', margin + 5, yPos);
    doc.text('Amount', pageWidth - margin - 5, yPos, { align: 'right' });
    yPos += 8;

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    if (invoice.line_items && invoice.line_items.length > 0) {
        invoice.line_items.forEach((item, index) => {
            const itemText = typeof item === 'string' ? item : (item.description || item.name || 'Training Service');
            const itemAmount = typeof item === 'object' && item.amount ? item.amount : (invoice.total_amount / invoice.line_items.length);
            doc.text(`${index + 1}. ${itemText}`, margin + 5, yPos);
            doc.text(`$${parseFloat(itemAmount).toFixed(2)}`, pageWidth - margin - 5, yPos, { align: 'right' });
            yPos += 8;
            if (yPos > 250) {
                doc.addPage();
                yPos = 20;
            }
        });
    } else {
        doc.text('1. Training Services', margin + 5, yPos);
        doc.text(`$${parseFloat(invoice.total_amount || invoice.amount || 0).toFixed(2)}`, pageWidth - margin - 5, yPos, { align: 'right' });
        yPos += 8;
    }

    yPos += 10;

    // Totals Section
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

    doc.setFontSize(10);
    if (invoice.tax_amount && invoice.tax_amount > 0) {
        doc.text('Subtotal:', pageWidth - margin - 60, yPos);
        doc.text(`$${parseFloat((invoice.total_amount || invoice.amount) - invoice.tax_amount).toFixed(2)}`, pageWidth - margin - 5, yPos, { align: 'right' });
        yPos += 8;
        doc.text('Tax:', pageWidth - margin - 60, yPos);
        doc.text(`$${parseFloat(invoice.tax_amount).toFixed(2)}`, pageWidth - margin - 5, yPos, { align: 'right' });
        yPos += 8;
    }

    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Total:', pageWidth - margin - 60, yPos);
    doc.setTextColor(37, 99, 235);
    doc.text(`$${parseFloat(invoice.total_amount || invoice.amount || 0).toFixed(2)}`, pageWidth - margin - 5, yPos, { align: 'right' });
    yPos += 20;

    // Payment Instructions
    if (invoice.status === 'pending' || invoice.status === 'overdue') {
        doc.setTextColor(239, 68, 68);
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('Payment Due: Please pay by the due date', margin, yPos);
        yPos += 10;
    }

    // Footer
    doc.setTextColor(128, 128, 128);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text('For questions, contact: info@godspeedbasketball.com', margin, yPos);
    yPos += 6;
    doc.text('Denver Basketball Center | Godspeed HQ, Denver, CO', margin, yPos);

    // Download - named for easy filing: GODSPEED_Invoice_[Name]_[ID]_[Date].pdf
    const invoiceId = invoice.invoice_number || 'Unknown';
    const invoiceParentName = (invoice.parent_name || localStorage.getItem('gba_user_email') || 'Parent').split('@')[0].replace(/\s+/g, '-');
    const invoiceDate = invoice.issue_date ? new Date(invoice.issue_date).toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7);
    doc.save(`GODSPEED_Invoice_${invoiceParentName}_${invoiceId}_${invoiceDate}.pdf`);
}
