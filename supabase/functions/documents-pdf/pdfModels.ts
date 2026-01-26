// supabase/functions/documents-pdf/pdfModels.ts
// PDF View Models - Type-safe data contracts for PDF generation

/**
 * Receipt PDF Model
 * All fields are required - validation will fail if missing
 */
export interface ReceiptPdfModel {
  // Document identification
  receiptNumber: string;
  transactionId: string;
  paymentDate: Date;
  paymentMethod: string;
  
  // Payer information
  payerName: string; // first_name + last_name from parent_accounts
  payerEmail: string; // email from parent_accounts
  payerPhone: string | null; // phone from parent_accounts
  
  // Athlete information (if available)
  athleteId: string | null;
  athleteName: string | null;
  
  // Financial
  amount: number;
  items: ReceiptLineItem[];
}

export interface ReceiptLineItem {
  description: string;
  quantity: number;
  amount: number;
}

/**
 * Invoice PDF Model
 * All fields are required - validation will fail if missing
 */
export interface InvoicePdfModel {
  // Document identification
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  status: "pending" | "paid" | "overdue" | "cancelled";
  
  // Payer information
  payerName: string;
  payerEmail: string;
  payerPhone: string | null;
  
  // Athlete information (if available)
  athleteId: string | null;
  athleteName: string | null;
  
  // Financial
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  hoursPurchased?: number; // For purchase-based line items
  isAdjustment?: boolean; // True for "Other adjustments" line in mixed invoices
}

/**
 * Syllabus PDF Model
 */
export interface SyllabusPdfModel {
  programName: string;
  version: string | null;
  effectiveDate: Date;
  sections: SyllabusSection[];
}

export interface SyllabusSection {
  title: string;
  content: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  missingFields: string[];
}

/**
 * Map database receipt row to ReceiptPdfModel
 * This is the ONLY place where DB field names are referenced for receipts
 * 
 * V1: athleteId is now required (non-nullable for new receipts)
 */
export function mapReceiptToPdfModel(
  document: any,
  parentAccount: any,
  athleteInfo: any | null
): ReceiptPdfModel {
  const metadata = document.metadata || {};
  
  // Extract items from metadata
  // V1: Use canonical item from metadata.item if available, otherwise from items array
  const items: ReceiptLineItem[] = [];
  
  // Check for canonical item description first
  const canonicalItem = metadata.item;
  
  if (canonicalItem) {
    // Use canonical item description
    items.push({
      description: canonicalItem,
      quantity: 1,
      amount: parseFloat(document.amount || 0),
    });
  } else {
    // Fall back to items array
    const rawItems = Array.isArray(metadata.items) ? metadata.items : [];
    
    for (const item of rawItems) {
      items.push({
        description: item.description || item.name || item.title || "Item",
        quantity: item.quantity || 1,
        amount: parseFloat(item.amount || item.price || 0),
      });
    }
    
    // If no items, create default from amount
    if (items.length === 0 && document.amount) {
      items.push({
        description: "Training Package",
        quantity: 1,
        amount: parseFloat(document.amount),
      });
    }
  }
  
  // Build payer name
  const payerName = parentAccount?.first_name && parentAccount?.last_name
    ? `${parentAccount.first_name} ${parentAccount.last_name}`
    : parentAccount?.email || "Customer";
  
  return {
    receiptNumber: metadata.receipt_number || "",
    transactionId: metadata.transaction_id || "",
    paymentDate: new Date(document.date),
    paymentMethod: metadata.payment_method || "",
    payerName,
    payerEmail: parentAccount?.email || "",
    payerPhone: parentAccount?.phone || null,
    athleteId: document.athlete_id || null, // Now available from receipts table
    athleteName: athleteInfo?.name || null, // Only if athlete record exists
    amount: parseFloat(document.amount || 0),
    items,
  };
}

/**
 * Map database invoice row to InvoicePdfModel
 * This is the ONLY place where DB field names are referenced for invoices
 * 
 * V1: Supports purchase-based, balance-based, and mixed invoices
 */
export async function mapInvoiceToPdfModel(
  document: any,
  parentAccount: any,
  supabase: any
): Promise<InvoicePdfModel> {
  const metadata = document.metadata || {};
  const invoiceType = document.invoice_type || "purchase";
  
  // Build payer name
  const payerName = parentAccount?.first_name && parentAccount?.last_name
    ? `${parentAccount.first_name} ${parentAccount.last_name}`
    : parentAccount?.email || "Customer";
  
  const lineItems: InvoiceLineItem[] = [];
  const athleteIds: string[] = [];
  const athleteNames: string[] = [];
  let subtotal = 0;
  let adjustments = 0;
  
  // For purchase and mixed invoices, load linked purchases
  if (invoiceType === "purchase" || invoiceType === "mixed") {
    const { data: invoicePurchases } = await supabase
      .from("invoice_purchases")
      .select(`
        purchase_id,
        training_purchases!inner(
          id,
          athlete_id,
          hours_purchased,
          price_paid,
          purchase_date
        )
      `)
      .eq("invoice_id", document.id);
    
    if (invoicePurchases && invoicePurchases.length > 0) {
      for (const ip of invoicePurchases) {
        const purchase = ip.training_purchases;
        if (purchase) {
          const amount = parseFloat(purchase.price_paid || 0);
          const hours = parseFloat(purchase.hours_purchased || 0);
          
          // Build description
          const description = `${hours} Hour Training Package`;
          
          lineItems.push({
            description,
            quantity: 1,
            unitPrice: amount,
            amount,
            hoursPurchased: hours,
            isAdjustment: false,
          });
          
          subtotal += amount;
          
          // Collect athlete IDs
          if (purchase.athlete_id && !athleteIds.includes(purchase.athlete_id)) {
            athleteIds.push(purchase.athlete_id);
          }
        }
      }
    }
  }
  
  // For balance invoices, no line items - just show total
  if (invoiceType === "balance") {
    // No line items for balance invoices
    subtotal = 0;
  }
  
  // Calculate adjustments for mixed invoices
  const taxAmount = parseFloat(metadata.tax_amount || 0);
  const totalAmount = parseFloat(document.amount || subtotal + taxAmount);
  
  if (invoiceType === "mixed") {
    adjustments = totalAmount - subtotal - taxAmount;
    if (Math.abs(adjustments) > 0.01) { // Only show if significant
      lineItems.push({
        description: "Other adjustments",
        quantity: 1,
        unitPrice: adjustments,
        amount: adjustments,
        isAdjustment: true,
      });
    }
  }
  
  // Validate: derived sum must equal totalAmount (with tolerance for rounding)
  const derivedTotal = subtotal + taxAmount + adjustments;
  if (Math.abs(derivedTotal - totalAmount) > 0.01) {
    throw new Error(`Invoice total mismatch: derived ${derivedTotal} != stored ${totalAmount}`);
  }
  
  return {
    invoiceNumber: metadata.invoice_number || "",
    issueDate: new Date(document.date),
    dueDate: new Date(metadata.due_date || document.date),
    status: (document.status || "pending") as "pending" | "paid" | "overdue" | "cancelled",
    invoiceType: invoiceType as "purchase" | "balance" | "mixed",
    payerName,
    payerEmail: parentAccount?.email || "",
    payerPhone: parentAccount?.phone || null,
    athleteIds,
    athleteNames, // Will be populated by caller if needed
    lineItems,
    subtotal,
    taxAmount,
    totalAmount,
    adjustments,
  };
}

/**
 * Map database syllabus row to SyllabusPdfModel
 */
export function mapSyllabusToPdfModel(document: any): SyllabusPdfModel {
  const metadata = document.metadata || {};
  
  const sections: SyllabusSection[] = [];
  if (Array.isArray(metadata.sections)) {
    for (const section of metadata.sections) {
      sections.push({
        title: section.title || "Section",
        content: section.content || "",
      });
    }
  }
  
  return {
    programName: document.title || metadata.program_name || "Program Syllabus",
    version: metadata.version || null,
    effectiveDate: new Date(document.date),
    sections,
  };
}

/**
 * Validate ReceiptPdfModel - fail loudly if required fields missing
 * V1: athleteId is required for new receipts (legacy receipts may be null)
 */
export function validateReceiptPdfModel(
  model: ReceiptPdfModel,
  isLegacy: boolean = false
): ValidationResult {
  const missingFields: string[] = [];
  
  if (!model.receiptNumber || model.receiptNumber.trim() === "") {
    missingFields.push("receipt_number");
  }
  if (!model.transactionId || model.transactionId.trim() === "") {
    missingFields.push("transaction_id");
  }
  if (!model.paymentMethod || model.paymentMethod.trim() === "") {
    missingFields.push("payment_method");
  }
  if (!model.payerName || model.payerName.trim() === "") {
    missingFields.push("payer_name");
  }
  if (!model.payerEmail || model.payerEmail.trim() === "") {
    missingFields.push("payer_email");
  }
  if (model.amount <= 0) {
    missingFields.push("amount");
  }
  if (!model.items || model.items.length === 0) {
    missingFields.push("items");
  }
  
  // V1: athleteId is required for new receipts
  // Legacy receipts (isLegacy=true) can have null athleteId
  if (!isLegacy && (!model.athleteId || model.athleteId.trim() === "")) {
    missingFields.push("athleteId");
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Validate InvoicePdfModel - fail loudly if required fields missing
 * V1: Different validation rules for purchase vs balance invoices
 */
export function validateInvoicePdfModel(model: InvoicePdfModel): ValidationResult {
  const missingFields: string[] = [];
  
  if (!model.invoiceNumber || model.invoiceNumber.trim() === "") {
    missingFields.push("invoice_number");
  }
  if (!model.payerName || model.payerName.trim() === "") {
    missingFields.push("payer_name");
  }
  if (!model.payerEmail || model.payerEmail.trim() === "") {
    missingFields.push("payer_email");
  }
  if (model.totalAmount <= 0) {
    missingFields.push("total_amount");
  }
  
  // Purchase invoices must have line items
  if (model.invoiceType === "purchase" && (!model.lineItems || model.lineItems.length === 0)) {
    missingFields.push("line_items");
  }
  
  // Balance invoices don't need line items, but should have totalAmount
  // Mixed invoices should have at least one purchase line item
  if (model.invoiceType === "mixed" && (!model.lineItems || model.lineItems.length === 0)) {
    missingFields.push("line_items");
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Validate SyllabusPdfModel - fail loudly if required fields missing
 */
export function validateSyllabusPdfModel(model: SyllabusPdfModel): ValidationResult {
  const missingFields: string[] = [];
  
  if (!model.programName || model.programName.trim() === "") {
    missingFields.push("program_name");
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}
