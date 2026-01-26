// supabase/functions/documents-pdf/index.ts
// Document PDF API - Generate professional PDF documents with strict validation

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import {
  ReceiptPdfModel,
  InvoicePdfModel,
  SyllabusPdfModel,
  mapReceiptToPdfModel,
  mapInvoiceToPdfModel,
  mapSyllabusToPdfModel,
  validateReceiptPdfModel,
  validateInvoicePdfModel,
  validateSyllabusPdfModel,
} from "./pdfModels.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Company information
const COMPANY_NAME = "Club Godspeed";
const COMPANY_ADDRESS = "Training Facility";
const COMPANY_EMAIL = "info@clubgodspeed.com";
const COMPANY_PHONE = "(555) 123-4567";

/**
 * Format currency
 */
function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Format date
 */
function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Draw text with word wrapping
 */
function drawTextWrapped(
  page: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  font: any,
  color: any = rgb(0, 0, 0)
): number {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
  const lineHeight = fontSize * 1.2;

  for (const word of words) {
    const testLine = line + (line ? " " : "") + word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    
    if (width > maxWidth && line) {
      page.drawText(line, {
        x,
        y: currentY,
        size: fontSize,
        font,
        color,
      });
      line = word;
      currentY -= lineHeight;
    } else {
      line = testLine;
    }
  }
  
  if (line) {
    page.drawText(line, {
      x,
      y: currentY,
      size: fontSize,
      font,
      color,
    });
  }

  return currentY;
}

/**
 * Build storage path for PDF
 * Format: documents/{type}/{docId}.pdf
 */
function buildStoragePath(documentType: string, documentId: string): string {
  return `${documentType}/${documentId}.pdf`;
}

/**
 * Check if PDF should be regenerated
 */
function shouldRegeneratePdf(
  documentUpdatedAt: string | Date,
  pdfUrl: string | null,
  documentStatus: string | null,
  previousStatus: string | null
): boolean {
  // Always regenerate if no PDF exists
  if (!pdfUrl) return true;
  
  // Regenerate if status changed (e.g., unpaid -> paid)
  if (documentStatus && previousStatus && documentStatus !== previousStatus) {
    return true;
  }
  
  // Regenerate if document was updated after PDF was generated
  // Note: We'd need to track PDF generation time, but for now, regenerate if updated_at is recent
  // In production, you'd compare with PDF file metadata
  return false; // Conservative: don't regenerate unless explicitly needed
}

/**
 * Authorize document access
 */
async function authorizeDocumentAccess(
  supabase: any,
  userId: string,
  document: any
): Promise<{ authorized: boolean; reason?: string }> {
  // Get user's parent account
  const { data: parentAccount } = await supabase
    .from("parent_accounts")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!parentAccount) {
    return { authorized: false, reason: "Parent account not found" };
  }

  // Check if document belongs to this parent
  if (document.payer_id !== parentAccount.id) {
    return { authorized: false, reason: "Document does not belong to user" };
  }

  // If document has athlete_id, verify parent has access to that athlete
  if (document.athlete_id) {
    const { data: enrollment } = await supabase
      .from("player_enrollments")
      .select("athlete_id")
      .eq("parent_id", parentAccount.id)
      .eq("athlete_id", document.athlete_id)
      .limit(1)
      .single();

    if (!enrollment) {
      // Check if athlete is linked via purchases
      const { data: purchase } = await supabase
        .from("training_purchases")
        .select("athlete_id")
        .eq("parent_id", parentAccount.id)
        .eq("athlete_id", document.athlete_id)
        .limit(1)
        .single();

      if (!purchase) {
        return { authorized: false, reason: "Athlete not linked to parent" };
      }
    }
  }

  return { authorized: true };
}

/**
 * Fetch complete receipt data with all related entities
 */
async function fetchReceiptData(
  supabase: any,
  documentId: string,
  parentAccountId: string
): Promise<{ document: any; parentAccount: any; athleteInfo: any | null }> {
  // Fetch document with all fields
  const { data: document, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("payer_id", parentAccountId)
    .single();

  if (docError || !document) {
    throw new Error("Document not found");
  }

  // Fetch parent account with all fields
  const { data: parentAccount, error: parentError } = await supabase
    .from("parent_accounts")
    .select("id, email, first_name, last_name, phone")
    .eq("id", parentAccountId)
    .single();

  if (parentError || !parentAccount) {
    throw new Error("Parent account not found");
  }

  // Fetch athlete info if available
  let athleteInfo: any | null = null;
  if (document.athlete_id) {
    // Try to get athlete name from enrollments or purchases
    const { data: enrollment } = await supabase
      .from("player_enrollments")
      .select("athlete_id, program_name")
      .eq("parent_id", parentAccountId)
      .eq("athlete_id", document.athlete_id)
      .limit(1)
      .single();

    if (enrollment) {
      athleteInfo = { name: document.athlete_id }; // Use ID as name if no name field exists
    }
  }

  return { document, parentAccount, athleteInfo };
}

/**
 * Fetch complete invoice data with all related entities
 */
async function fetchInvoiceData(
  supabase: any,
  documentId: string,
  parentAccountId: string
): Promise<{ document: any; parentAccount: any; athleteInfo: any | null }> {
  // Same as receipt for now
  return fetchReceiptData(supabase, documentId, parentAccountId);
}

/**
 * Fetch complete syllabus data
 */
async function fetchSyllabusData(
  supabase: any,
  documentId: string,
  parentAccountId: string
): Promise<{ document: any; parentAccount: any; athleteInfo: any | null }> {
  return fetchReceiptData(supabase, documentId, parentAccountId);
}

/**
 * Generate Receipt PDF
 */
async function generateReceiptPDF(
  pdfDoc: PDFDocument,
  model: ReceiptPdfModel
): Promise<void> {
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 750;
  const margin = 50;
  const pageWidth = 612;
  const contentWidth = pageWidth - 2 * margin;

  // Header - Company Info
  page.drawText(COMPANY_NAME, {
    x: margin,
    y: y,
    size: 24,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 30;

  page.drawText(COMPANY_ADDRESS, {
    x: margin,
    y: y,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 15;

  page.drawText(`Email: ${COMPANY_EMAIL} | Phone: ${COMPANY_PHONE}`, {
    x: margin,
    y: y,
    size: 9,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 40;

  // Receipt Title
  page.drawText("PAYMENT RECEIPT", {
    x: margin,
    y: y,
    size: 20,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 40;

  // Receipt Number and Date (two columns)
  page.drawText(`Receipt Number:`, {
    x: margin,
    y: y,
    size: 10,
    font: boldFont,
  });
  page.drawText(model.receiptNumber, {
    x: margin + 100,
    y: y,
    size: 10,
    font: font,
  });

  page.drawText(`Date:`, {
    x: pageWidth - margin - 150,
    y: y,
    size: 10,
    font: boldFont,
  });
  page.drawText(formatDate(model.paymentDate), {
    x: pageWidth - margin - 100,
    y: y,
    size: 10,
    font: font,
  });
  y -= 20;

  page.drawText(`Transaction ID:`, {
    x: margin,
    y: y,
    size: 10,
    font: boldFont,
  });
  page.drawText(model.transactionId, {
    x: margin + 100,
    y: y,
    size: 10,
    font: font,
  });

  page.drawText(`Payment Method:`, {
    x: pageWidth - margin - 150,
    y: y,
    size: 10,
    font: boldFont,
  });
  page.drawText(model.paymentMethod, {
    x: pageWidth - margin - 100,
    y: y,
    size: 10,
    font: font,
  });
  y -= 30;

  // Customer Information
  page.drawText("Bill To:", {
    x: margin,
    y: y,
    size: 11,
    font: boldFont,
  });
  y -= 15;

  page.drawText(model.payerName, {
    x: margin,
    y: y,
    size: 10,
    font: font,
  });
  y -= 15;

  // NOTE: Athlete name is NOT reliably available for receipts
  // Only show if explicitly provided and not null
  if (model.athleteName && model.athleteName.trim() !== "") {
    page.drawText(`Athlete: ${model.athleteName}`, {
      x: margin,
      y: y,
      size: 10,
      font: font,
    });
    y -= 15;
  }

  if (model.payerPhone) {
    page.drawText(`Phone: ${model.payerPhone}`, {
      x: margin,
      y: y,
      size: 10,
      font: font,
    });
    y -= 15;
  }

  y -= 20;

  // Items Table Header
  page.drawRectangle({
    x: margin,
    y: y - 2,
    width: contentWidth,
    height: 20,
    color: rgb(0.9, 0.9, 0.9),
  });

  page.drawText("Description", {
    x: margin + 5,
    y: y + 5,
    size: 10,
    font: boldFont,
  });
  page.drawText("Amount", {
    x: pageWidth - margin - 80,
    y: y + 5,
    size: 10,
    font: boldFont,
  });
  y -= 25;

  // Items
  for (const item of model.items) {
    let itemText = item.description;
    if (item.quantity > 1) {
      itemText = `${item.quantity}x ${item.description}`;
    }

    const descY = drawTextWrapped(page, itemText, margin + 5, y, contentWidth - 100, 10, font);
    page.drawText(formatCurrency(item.amount), {
      x: pageWidth - margin - 80,
      y: y,
      size: 10,
      font: font,
    });
    y = descY - 20;

      if (y < 150) {
        const newPage = pdfDoc.addPage([612, 792]);
        y = 750;
        page.drawText("(continued)", {
          x: margin,
          y: y,
          size: 9,
          font: font,
          color: rgb(0.5, 0.5, 0.5),
        });
        y -= 30;
      }
    }
  } else {
    // No items - show default item from amount
    page.drawText("Training Package", {
      x: margin + 5,
      y: y,
      size: 10,
      font: font,
    });
    page.drawText(formatCurrency(model.amount), {
      x: pageWidth - margin - 80,
      y: y,
      size: 10,
      font: font,
    });
    y -= 20;
  }

  // Total Section
  y = Math.min(y, 200);
  y -= 20;

  page.drawLine({
    start: { x: margin, y: y },
    end: { x: pageWidth - margin, y: y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 20;

  page.drawText("Total Paid:", {
    x: pageWidth - margin - 150,
    y: y,
    size: 12,
    font: boldFont,
  });
  page.drawText(formatCurrency(model.amount), {
    x: pageWidth - margin - 80,
    y: y,
    size: 12,
    font: boldFont,
    color: rgb(0, 0.5, 0),
  });
  y -= 30;

  // Footer
  page.drawText("Thank you for your business!", {
    x: margin,
    y: y,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
}

/**
 * Generate Invoice PDF
 */
async function generateInvoicePDF(
  pdfDoc: PDFDocument,
  model: InvoicePdfModel
): Promise<void> {
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 750;
  const margin = 50;
  const pageWidth = 612;
  const contentWidth = pageWidth - 2 * margin;

  // Header
  page.drawText(COMPANY_NAME, {
    x: margin,
    y: y,
    size: 24,
    font: boldFont,
  });
  y -= 30;

  page.drawText(COMPANY_ADDRESS, {
    x: margin,
    y: y,
    size: 10,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 15;

  page.drawText(`Email: ${COMPANY_EMAIL} | Phone: ${COMPANY_PHONE}`, {
    x: margin,
    y: y,
    size: 9,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 40;

  // Invoice Title
  page.drawText("INVOICE", {
    x: margin,
    y: y,
    size: 20,
    font: boldFont,
  });
  y -= 40;

  // Invoice Number and Dates
  page.drawText(`Invoice Number:`, {
    x: margin,
    y: y,
    size: 10,
    font: boldFont,
  });
  page.drawText(model.invoiceNumber, {
    x: margin + 100,
    y: y,
    size: 10,
    font: font,
  });

  page.drawText(`Status:`, {
    x: pageWidth - margin - 150,
    y: y,
    size: 10,
    font: boldFont,
  });
  const statusColor = model.status === "paid" ? rgb(0, 0.5, 0) : model.status === "overdue" ? rgb(0.8, 0, 0) : rgb(0.5, 0.5, 0);
  page.drawText(model.status.toUpperCase(), {
    x: pageWidth - margin - 100,
    y: y,
    size: 10,
    font: boldFont,
    color: statusColor,
  });
  y -= 20;

  page.drawText(`Issue Date:`, {
    x: margin,
    y: y,
    size: 10,
    font: boldFont,
  });
  page.drawText(formatDate(model.issueDate), {
    x: margin + 100,
    y: y,
    size: 10,
    font: font,
  });

  page.drawText(`Due Date:`, {
    x: pageWidth - margin - 150,
    y: y,
    size: 10,
    font: boldFont,
  });
  page.drawText(formatDate(model.dueDate), {
    x: pageWidth - margin - 100,
    y: y,
    size: 10,
    font: font,
  });
  y -= 30;

  // Customer Information
  page.drawText("Bill To:", {
    x: margin,
    y: y,
    size: 11,
    font: boldFont,
  });
  y -= 15;

  page.drawText(model.payerName, {
    x: margin,
    y: y,
    size: 10,
    font: font,
  });
  y -= 15;

  // NOTE: Athlete name is NOT reliably available for receipts
  // Only show if explicitly provided and not null
  if (model.athleteName && model.athleteName.trim() !== "") {
    page.drawText(`Athlete: ${model.athleteName}`, {
      x: margin,
      y: y,
      size: 10,
      font: font,
    });
    y -= 15;
  }

  if (model.payerPhone) {
    page.drawText(`Phone: ${model.payerPhone}`, {
      x: margin,
      y: y,
      size: 10,
      font: font,
    });
    y -= 15;
  }

  y -= 20;

  // Items Table Header
  page.drawRectangle({
    x: margin,
    y: y - 2,
    width: contentWidth,
    height: 20,
    color: rgb(0.9, 0.9, 0.9),
  });

  page.drawText("Description", {
    x: margin + 5,
    y: y + 5,
    size: 10,
    font: boldFont,
  });
  page.drawText("Qty", {
    x: pageWidth - margin - 200,
    y: y + 5,
    size: 10,
    font: boldFont,
  });
  page.drawText("Unit Price", {
    x: pageWidth - margin - 140,
    y: y + 5,
    size: 10,
    font: boldFont,
  });
  page.drawText("Amount", {
    x: pageWidth - margin - 80,
    y: y + 5,
    size: 10,
    font: boldFont,
  });
  y -= 25;

  // V1: Handle different invoice types
  if (model.invoiceType === "balance") {
    // Balance invoice: no line items table, just show total
    page.drawText("Account Balance Due", {
      x: margin + 5,
      y: y,
      size: 10,
      font: font,
    });
    page.drawText("1", {
      x: pageWidth - margin - 200,
      y: y,
      size: 10,
      font: font,
    });
    page.drawText(formatCurrency(model.totalAmount), {
      x: pageWidth - margin - 140,
      y: y,
      size: 10,
      font: font,
    });
    page.drawText(formatCurrency(model.totalAmount), {
      x: pageWidth - margin - 80,
      y: y,
      size: 10,
      font: font,
    });
    y -= 20;
  } else if (model.invoiceType === "purchase" && model.lineItems.length > 0) {
    // Purchase invoice: show line items from linked purchases (only if available)
    for (const item of model.lineItems) {
      let description = item.description;
      // Add hours info for purchase-based items
      if (item.hoursPurchased && !item.isAdjustment) {
        description = `${description} (${item.hoursPurchased} hours)`;
      }
      
      const descY = drawTextWrapped(page, description, margin + 5, y, contentWidth - 250, 10, font);
      page.drawText(item.quantity.toString(), {
        x: pageWidth - margin - 200,
        y: y,
        size: 10,
        font: font,
      });
      page.drawText(formatCurrency(item.unitPrice), {
        x: pageWidth - margin - 140,
        y: y,
        size: 10,
        font: font,
      });
      page.drawText(formatCurrency(item.amount), {
        x: pageWidth - margin - 80,
        y: y,
        size: 10,
        font: font,
        color: item.isAdjustment ? rgb(0.5, 0.5, 0.5) : rgb(0, 0, 0),
      });
      y = descY - 20;

      if (y < 200) {
        const newPage = pdfDoc.addPage([612, 792]);
        y = 750;
        page.drawText("(continued)", {
          x: margin,
          y: y,
          size: 9,
          font: font,
          color: rgb(0.5, 0.5, 0.5),
        });
        y -= 30;
      }
    }
  } else if (model.invoiceType === "mixed" && model.lineItems.length > 0) {
    // Mixed invoice: show purchase line items + adjustments
    for (const item of model.lineItems) {
      let description = item.description;
      if (item.hoursPurchased && !item.isAdjustment) {
        description = `${description} (${item.hoursPurchased} hours)`;
      }
      
      const descY = drawTextWrapped(page, description, margin + 5, y, contentWidth - 250, 10, font);
      page.drawText(item.quantity.toString(), {
        x: pageWidth - margin - 200,
        y: y,
        size: 10,
        font: font,
      });
      page.drawText(formatCurrency(item.unitPrice), {
        x: pageWidth - margin - 140,
        y: y,
        size: 10,
        font: font,
      });
      page.drawText(formatCurrency(item.amount), {
        x: pageWidth - margin - 80,
        y: y,
        size: 10,
        font: font,
        color: item.isAdjustment ? rgb(0.5, 0.5, 0.5) : rgb(0, 0, 0),
      });
      y = descY - 20;

      if (y < 200) {
        const newPage = pdfDoc.addPage([612, 792]);
        y = 750;
        page.drawText("(continued)", {
          x: margin,
          y: y,
          size: 9,
          font: font,
          color: rgb(0.5, 0.5, 0.5),
        });
        y -= 30;
      }
    }
  } else {
    // No line items available - show summary only
    // V1: Don't print fake line items - only show if invoice_purchases linkage exists
    page.drawText("Invoice Summary", {
      x: margin + 5,
      y: y,
      size: 10,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    y -= 20;
  }

  // Totals Section
  y = Math.min(y, 250);
  y -= 20;

  page.drawLine({
    start: { x: margin, y: y },
    end: { x: pageWidth - margin, y: y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 20;

  page.drawText("Subtotal:", {
    x: pageWidth - margin - 150,
    y: y,
    size: 10,
    font: font,
  });
  page.drawText(formatCurrency(model.subtotal), {
    x: pageWidth - margin - 80,
    y: y,
    size: 10,
    font: font,
  });
  y -= 20;

  if (model.taxAmount > 0) {
    page.drawText("Tax:", {
      x: pageWidth - margin - 150,
      y: y,
      size: 10,
      font: font,
    });
    page.drawText(formatCurrency(model.taxAmount), {
      x: pageWidth - margin - 80,
      y: y,
      size: 10,
      font: font,
    });
    y -= 20;
  }

  page.drawLine({
    start: { x: margin, y: y },
    end: { x: pageWidth - margin, y: y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 20;

  page.drawText("Total Due:", {
    x: pageWidth - margin - 150,
    y: y,
    size: 12,
    font: boldFont,
  });
  page.drawText(formatCurrency(model.totalAmount), {
    x: pageWidth - margin - 80,
    y: y,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0.8),
  });
  y -= 30;

  // Footer
  page.drawText("Payment Terms:", {
    x: margin,
    y: y,
    size: 10,
    font: boldFont,
  });
  y -= 15;

  page.drawText(`Payment is due by ${formatDate(model.dueDate)}. Thank you for your business!`, {
    x: margin,
    y: y,
    size: 9,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
}

/**
 * Generate Syllabus PDF
 */
async function generateSyllabusPDF(
  pdfDoc: PDFDocument,
  model: SyllabusPdfModel
): Promise<void> {
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 750;
  const margin = 50;

  page.drawText(COMPANY_NAME, {
    x: margin,
    y: y,
    size: 24,
    font: boldFont,
  });
  y -= 40;

  page.drawText(model.programName, {
    x: margin,
    y: y,
    size: 18,
    font: boldFont,
  });
  y -= 40;

  page.drawText(`Effective Date: ${formatDate(model.effectiveDate)}`, {
    x: margin,
    y: y,
    size: 12,
    font: font,
  });
  y -= 30;

  if (model.version) {
    page.drawText(`Version: ${model.version}`, {
      x: margin,
      y: y,
      size: 12,
      font: font,
    });
    y -= 30;
  }

  for (const section of model.sections) {
    y -= 20;
    page.drawText(section.title, {
      x: margin,
      y: y,
      size: 14,
      font: boldFont,
    });
    y -= 20;

    y = drawTextWrapped(page, section.content, margin, y, 512, 11, font);
    y -= 20;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required", code: "AUTH_REQUIRED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication", code: "AUTH_REQUIRED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse URL path: /documents/:type/:id/pdf
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter((p) => p && p !== "index.ts" && p !== "pdf");
    
    // Expected format: ["documents", "receipt", "uuid"] or ["documents", "invoice", "uuid"]
    if (pathParts.length < 3 || pathParts[0] !== "documents") {
      return new Response(
        JSON.stringify({ error: "Invalid path format. Expected: /documents/:type/:id/pdf", code: "VALIDATION_ERROR" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const documentType = pathParts[1]; // receipt, invoice, or syllabus
    const documentId = pathParts[2];

    if (!["receipt", "invoice", "syllabus"].includes(documentType)) {
      return new Response(
        JSON.stringify({ error: "Invalid document type. Must be: receipt, invoice, or syllabus", code: "VALIDATION_ERROR" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: "Document ID required", code: "VALIDATION_ERROR" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get parent account
    const { data: parentAccount, error: parentError } = await supabase
      .from("parent_accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (parentError || !parentAccount) {
      return new Response(
        JSON.stringify({ error: "Parent account not found", code: "NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle syllabus differently - stream stored PDF if available
    if (documentType === "syllabus") {
      // For syllabus, load from receipts or invoices table if linked, or from documents
      const { data: document, error: docError } = await supabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .eq("type", "syllabus")
        .single();

      if (docError || !document) {
        return new Response(
          JSON.stringify({ error: "Syllabus not found", code: "NOT_FOUND" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Authorize access
      const authResult = await authorizeDocumentAccess(supabase, user.id, document);
      if (!authResult.authorized) {
        return new Response(
          JSON.stringify({ error: "Access denied", code: "FORBIDDEN", details: authResult.reason }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If PDF URL exists, redirect to it
      if (document.pdf_url) {
        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            Location: document.pdf_url,
          },
        });
      }

      // Otherwise, generate it (fall through to generation)
    }

    // For receipts and invoices, load from their respective tables
    let document: any;
    
    if (documentType === "receipt") {
      // V1: Load from receipts table (canonical source)
      const { data: receipt, error: receiptError } = await supabase
        .from("receipts")
        .select(`
          *,
          parent_accounts!inner(
            id,
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .eq("id", documentId)
        .single();

      if (receiptError || !receipt) {
        return new Response(
          JSON.stringify({ error: "Receipt not found", code: "NOT_FOUND" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check authorization - parent can only access their own receipt
      const { data: parentAccount } = await supabase
        .from("parent_accounts")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!parentAccount || receipt.parent_id !== parentAccount.id) {
        return new Response(
          JSON.stringify({ error: "Access denied", code: "FORBIDDEN" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate required fields (V1: athleteId is required)
      const requiredFields = {
        receipt_number: receipt.receipt_number,
        payment_date: receipt.payment_date,
        amount: receipt.amount,
        status: receipt.status,
        parent_id: receipt.parent_id,
        athlete_id: receipt.athlete_id, // Required for V1
      };

      const missingFields: string[] = [];
      for (const [field, value] of Object.entries(requiredFields)) {
        if (value === null || value === undefined || value === "") {
          missingFields.push(field);
        }
      }

      if (missingFields.length > 0) {
        return new Response(
          JSON.stringify({
            error: "Required fields missing for receipt PDF",
            code: "VALIDATION_ERROR",
            missing_fields: missingFields,
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if PDF exists and record not updated since generation
      // V1: If pdfUrl exists and receipt hasn't been updated, stream cached PDF
      if (receipt.pdf_url) {
        // Check if receipt was updated after PDF was generated
        // For V1: If receipt has updated_at and it's older than created_at, assume PDF is stale
        // Otherwise, if pdf_url exists, return cached PDF
        const receiptUpdatedAt = receipt.updated_at;
        const receiptCreatedAt = receipt.created_at;
        
        // If receipt hasn't been updated since creation, PDF is valid
        if (!receiptUpdatedAt || receiptUpdatedAt === receiptCreatedAt) {
          // Stream cached PDF from storage (don't redirect to storage URL - security)
          const filePath = receipt.pdf_url.split("/").slice(-2).join("/");
          const { data: fileData, error: fileError } = await supabase.storage
            .from("documents")
            .download(filePath);
          
          if (!fileError && fileData) {
            const arrayBuffer = await fileData.arrayBuffer();
            return new Response(arrayBuffer, {
              headers: {
                ...corsHeaders,
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="receipt_${receipt.receipt_number}.pdf"`,
              },
              status: 200,
            });
          }
          // If file not found in storage, regenerate
        }
        // If receipt was updated, regenerate to ensure PDF matches current data
      }

      // Convert receipt to document format for processing
      // V1: Use receipts table as canonical source
      const parent = receipt.parent_accounts;
      const parentName = parent?.first_name && parent?.last_name
        ? `${parent.first_name} ${parent.last_name}`
        : parent?.email || "Customer";

      // Extract item description from items array or use default
      let itemDescription = "Training Package";
      if (receipt.items && Array.isArray(receipt.items) && receipt.items.length > 0) {
        const firstItem = receipt.items[0];
        itemDescription = firstItem.description || firstItem.name || firstItem.title || "Training Package";
      }

      document = {
        id: receipt.id,
        type: "receipt",
        title: `Receipt #${receipt.receipt_number}`,
        date: receipt.payment_date,
        amount: receipt.amount,
        status: receipt.status || "Paid",
        payer_id: receipt.parent_id,
        athlete_id: receipt.athlete_id, // V1: Required, from receipts table
        pdf_url: receipt.pdf_url,
        metadata: {
          receipt_number: receipt.receipt_number,
          transaction_id: receipt.transaction_id || "",
          payment_method: receipt.payment_method || "",
          items: receipt.items || [],
          item: itemDescription, // Canonical item description
        },
        // Include parent data for PDF generation
        parent_account: {
          id: parent?.id || receipt.parent_id,
          first_name: parent?.first_name,
          last_name: parent?.last_name,
          email: parent?.email || "",
          phone: parent?.phone || null,
        },
      };
    } else if (documentType === "invoice") {
      // Load from invoices table
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .select("*, parent_accounts(*)")
        .eq("id", documentId)
        .single();

      if (invoiceError || !invoice) {
        return new Response(
          JSON.stringify({ error: "Invoice not found", code: "NOT_FOUND" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check authorization
      const { data: parentAccount } = await supabase
        .from("parent_accounts")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!parentAccount || invoice.parent_id !== parentAccount.id) {
        return new Response(
          JSON.stringify({ error: "Access denied", code: "FORBIDDEN" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if PDF exists
      if (invoice.pdf_url) {
        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            Location: invoice.pdf_url,
          },
        });
      }

      // Convert invoice to document format for processing
      // V1: Invoices now have invoice_type and linked purchases
      document = {
        id: invoice.id,
        type: "invoice",
        title: `Invoice #${invoice.invoice_number}`,
        date: invoice.issue_date,
        amount: invoice.total_amount,
        status: invoice.status,
        payer_id: invoice.parent_id,
        athlete_id: null, // Invoices don't have direct athlete_id (derived from purchases)
        invoice_type: invoice.invoice_type || "purchase", // V1: purchase, balance, or mixed
        pdf_url: invoice.pdf_url,
        metadata: {
          invoice_number: invoice.invoice_number,
          issue_date: invoice.issue_date,
          due_date: invoice.due_date,
          tax_amount: invoice.tax_amount,
          line_items: invoice.line_items || [], // Legacy: may not be used if invoice_purchases exists
        },
      };
    } else {
      // Syllabus - already handled above, but fall through for generation
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .eq("type", "syllabus")
        .single();

      if (docError || !doc) {
        return new Response(
          JSON.stringify({ error: "Syllabus not found", code: "NOT_FOUND" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      document = doc;
    }

    // Get parent account for data fetching
    const { data: parentAccount, error: parentError } = await supabase
      .from("parent_accounts")
      .select("id, email, first_name, last_name, phone")
      .eq("user_id", user.id)
      .single();

    if (parentError || !parentAccount) {
      return new Response(
        JSON.stringify({ error: "Parent account not found", code: "NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For receipts and invoices, parent account is already loaded
    // For syllabus, fetch it
    let data: { document: any; parentAccount: any; athleteInfo: any | null };
    
    if (documentType === "receipt" || documentType === "invoice") {
      // Parent account already verified above
      data = {
        document,
        parentAccount: documentType === "receipt" 
          ? (await supabase.from("receipts").select("parent_id").eq("id", documentId).single()).data?.parent_accounts
          : (await supabase.from("invoices").select("parent_id").eq("id", documentId).single()).data?.parent_accounts
          || parentAccount,
        athleteInfo: null, // Athletes NOT reliably available for receipts/invoices
      };
    } else {
      // Syllabus
      data = await fetchSyllabusData(supabase, documentId, parentAccount.id);
    }

    // Map to PDF model
    let pdfModel: ReceiptPdfModel | InvoicePdfModel | SyllabusPdfModel;
    let validationResult: { isValid: boolean; missingFields: string[] };

    switch (documentType) {
      case "receipt": {
        // V1: Receipts use receipts table as canonical source
        // athleteId is required (validated above)
        const receiptAthleteId = document.athlete_id;
        const isLegacyReceipt = !receiptAthleteId;
        
        // Get athlete info (use athleteId as name if no athletes table)
        let athleteInfo: any | null = null;
        if (receiptAthleteId) {
          athleteInfo = { name: receiptAthleteId }; // Can be enhanced if athletes table exists
        }
        
        // Use parent_account from document (loaded from receipts join)
        const parentForPdf = document.parent_account || parentAccount;
        
        pdfModel = mapReceiptToPdfModel(document, parentForPdf, athleteInfo);
        validationResult = validateReceiptPdfModel(pdfModel as ReceiptPdfModel, isLegacyReceipt);
        break;
      }
      case "invoice": {
        // V1: Invoices support purchase/balance/mixed types
        // mapInvoiceToPdfModel is now async and loads purchases
        pdfModel = await mapInvoiceToPdfModel(document, parentAccount, supabase);
        
        // Populate athlete names if needed
        const invoiceModel = pdfModel as InvoicePdfModel;
        if (invoiceModel.athleteIds.length > 0) {
          // For now, use athleteId as name (can be enhanced if athletes table exists)
          invoiceModel.athleteNames = invoiceModel.athleteIds;
        }
        
        validationResult = validateInvoicePdfModel(invoiceModel);
        break;
      }
      case "syllabus": {
        pdfModel = mapSyllabusToPdfModel(data.document);
        validationResult = validateSyllabusPdfModel(pdfModel as SyllabusPdfModel);
        break;
      }
      default:
        throw new Error("Invalid document type");
    }

    // Validate - fail loudly if required fields missing
    if (!validationResult.isValid) {
      console.error(`PDF generation failed for document ${actualDocumentId}: missing fields`, validationResult.missingFields);
      return new Response(
        JSON.stringify({
          error: "Required fields missing for PDF generation",
          code: "VALIDATION_ERROR",
          missing_fields: validationResult.missingFields,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate PDF
    const pdfDoc = await PDFDocument.create();

    switch (documentType) {
      case "receipt":
        await generateReceiptPDF(pdfDoc, pdfModel as ReceiptPdfModel);
        break;
      case "invoice":
        await generateInvoicePDF(pdfDoc, pdfModel as InvoicePdfModel);
        break;
      case "syllabus":
        await generateSyllabusPDF(pdfDoc, pdfModel as SyllabusPdfModel);
        break;
    }

    // Serialize PDF
    const pdfBytes = await pdfDoc.save();

    // Upload to Supabase Storage with standardized path
    const storagePath = buildStoragePath(documentType, documentId);
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    let pdfUrl = null;
    if (!uploadError) {
      // Get public URL
      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(storagePath);
      pdfUrl = urlData.publicUrl;

      // Update document with PDF URL based on type
      // V1: Update receipts table directly (canonical source)
      if (documentType === "receipt") {
        await supabase
          .from("receipts")
          .update({ pdf_url: pdfUrl })
          .eq("id", documentId);
      } else if (documentType === "invoice") {
        await supabase
          .from("invoices")
          .update({ pdf_url: pdfUrl })
          .eq("id", documentId);
      } else {
        await supabase
          .from("documents")
          .update({ pdf_url: pdfUrl })
          .eq("id", documentId);
      }
    } else {
      console.error("Upload error:", uploadError);
      // Continue anyway - return PDF directly
    }

    // Return PDF
    return new Response(pdfBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${storagePath}"`,
      },
      status: 200,
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message, code: "SERVER_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
