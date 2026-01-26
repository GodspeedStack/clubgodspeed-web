// supabase/functions/exports/generate-csv.ts
// CSV Generation Utilities - Match exact column definitions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Escape CSV field value
 */
function escapeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert array of objects to CSV string
 */
function arrayToCsv(data: Record<string, any>[], headers: string[]): string {
  const rows: string[] = [];
  
  // Header row
  rows.push(headers.map(escapeCsvField).join(","));
  
  // Data rows
  for (const row of data) {
    const values = headers.map((header) => escapeCsvField(row[header]));
    rows.push(values.join(","));
  }
  
  return rows.join("\n");
}

/**
 * Generate Attendance CSV
 * Columns: parentId, athleteId, athleteName, sessionDate, startTime, endTime, duration, activity, status, notes
 */
export async function generateAttendanceCSV(
  supabase: any,
  parentId: string,
  athleteId: string | null,
  from?: string,
  to?: string
): Promise<string> {
  // Query training_attendance with joins to get session and purchase info
  let query = supabase
    .from("training_attendance")
    .select(`
      *,
      training_sessions!inner(
        session_date,
        start_time,
        end_time,
        title,
        session_type
      ),
      training_purchases!inner(
        parent_id,
        athlete_id
      )
    `)
    .eq("training_purchases.parent_id", parentId);

  if (athleteId) {
    query = query.eq("training_purchases.athlete_id", athleteId);
  }

  if (from) {
    query = query.gte("training_sessions.session_date", from);
  }
  if (to) {
    query = query.lte("training_sessions.session_date", to);
  }

  query = query.order("training_sessions.session_date", { ascending: false });

  const { data: attendance } = await query;

  // Format data according to spec
  const csvData = (attendance || []).map((att: any) => {
    const session = att.training_sessions;
    const purchase = att.training_purchases;
    
    // Calculate duration from hours_used (already in hours)
    const duration = att.hours_used || 0;
    
    // Activity = session title or session_type
    const activity = session?.title || session?.session_type || "";
    
    return {
      parentId: purchase?.parent_id || parentId,
      athleteId: att.athlete_id || purchase?.athlete_id || "",
      athleteName: att.athlete_id || purchase?.athlete_id || "", // No athlete name table, use ID
      sessionDate: session?.session_date || "",
      startTime: session?.start_time || "",
      endTime: session?.end_time || "",
      duration: duration.toString(),
      activity,
      status: att.attendance_status || "present",
      notes: att.notes || "",
    };
  });

  return arrayToCsv(csvData, [
    "parentId",
    "athleteId",
    "athleteName",
    "sessionDate",
    "startTime",
    "endTime",
    "duration",
    "activity",
    "status",
    "notes",
  ]);
}

/**
 * Generate Purchases CSV
 * Columns: parentId, athleteId, athleteName, purchaseDate, item, hoursPurchased, amount, status, expiryDate, receiptLink
 */
export async function generatePurchasesCSV(
  supabase: any,
  parentId: string,
  athleteId: string | null,
  from?: string,
  to?: string
): Promise<string> {
  let query = supabase
    .from("training_purchases")
    .select("*")
    .eq("parent_id", parentId);

  if (athleteId) {
    query = query.eq("athlete_id", athleteId);
  }

  if (from) {
    query = query.gte("purchase_date", from);
  }
  if (to) {
    query = query.lte("purchase_date", to);
  }

  query = query.order("purchase_date", { ascending: false });

  const { data: purchases } = await query;

  // Get receipt links for purchases
  const purchaseIds = purchases?.map((p: any) => p.id) || [];
  const receiptMap = new Map<string, string>();

  if (purchaseIds.length > 0) {
    const { data: receipts } = await supabase
      .from("receipts")
      .select("purchase_id, pdf_url")
      .in("purchase_id", purchaseIds);

    receipts?.forEach((r: any) => {
      if (r.purchase_id) {
        receiptMap.set(r.purchase_id, r.pdf_url || "");
      }
    });
  }

  // Format data according to spec
  const csvData = (purchases || []).map((purchase: any) => {
    // Get package name if available
    let item = "Training Package";
    if (purchase.package_id) {
      // Could join with training_packages, but for now use hours
      item = `${purchase.hours_purchased} Hour Training Package`;
    }

    return {
      parentId: purchase.parent_id,
      athleteId: purchase.athlete_id || "",
      athleteName: purchase.athlete_id || "", // No athlete name table, use ID
      purchaseDate: purchase.purchase_date || "",
      item,
      hoursPurchased: purchase.hours_purchased?.toString() || "",
      amount: purchase.price_paid?.toString() || "0",
      status: purchase.status || "active",
      expiryDate: purchase.expiry_date || "",
      receiptLink: receiptMap.get(purchase.id) || "",
    };
  });

  return arrayToCsv(csvData, [
    "parentId",
    "athleteId",
    "athleteName",
    "purchaseDate",
    "item",
    "hoursPurchased",
    "amount",
    "status",
    "expiryDate",
    "receiptLink",
  ]);
}

/**
 * Generate Receipts CSV
 * Columns: parentId, receiptNumber, paymentDate, item, amount, status, pdfUrl
 */
export async function generateReceiptsCSV(
  supabase: any,
  parentId: string,
  athleteId: string | null,
  from?: string,
  to?: string
): Promise<string> {
  let query = supabase
    .from("receipts")
    .select("*")
    .eq("parent_id", parentId);

  if (from) {
    query = query.gte("payment_date", from);
  }
  if (to) {
    query = query.lte("payment_date", to);
  }

  query = query.order("payment_date", { ascending: false });

  const { data: receipts } = await query;

  // Format data according to spec
  const csvData = (receipts || []).map((receipt: any) => {
    // Extract item from items JSONB array
    let item = "Training Package";
    if (receipt.items && Array.isArray(receipt.items) && receipt.items.length > 0) {
      const firstItem = receipt.items[0];
      item = firstItem.description || firstItem.name || firstItem.title || "Item";
    }

    return {
      parentId: receipt.parent_id,
      receiptNumber: receipt.receipt_number || "",
      paymentDate: receipt.payment_date || "",
      item,
      amount: receipt.amount?.toString() || "0",
      status: "paid", // Receipts are always paid
      pdfUrl: receipt.pdf_url || "",
    };
  });

  return arrayToCsv(csvData, [
    "parentId",
    "receiptNumber",
    "paymentDate",
    "item",
    "amount",
    "status",
    "pdfUrl",
  ]);
}

/**
 * Generate Invoices CSV
 * Columns: parentId, invoiceNumber, issueDate, dueDate, totalAmount, status, pdfUrl
 */
export async function generateInvoicesCSV(
  supabase: any,
  parentId: string,
  athleteId: string | null,
  from?: string,
  to?: string
): Promise<string> {
  let query = supabase
    .from("invoices")
    .select("*")
    .eq("parent_id", parentId);

  if (from) {
    query = query.gte("issue_date", from);
  }
  if (to) {
    query = query.lte("issue_date", to);
  }

  query = query.order("issue_date", { ascending: false });

  const { data: invoices } = await query;

  // Format data according to spec
  const csvData = (invoices || []).map((invoice: any) => {
    return {
      parentId: invoice.parent_id,
      invoiceNumber: invoice.invoice_number || "",
      issueDate: invoice.issue_date || "",
      dueDate: invoice.due_date || "",
      totalAmount: invoice.total_amount?.toString() || "0",
      status: invoice.status || "pending",
      pdfUrl: invoice.pdf_url || "",
    };
  });

  return arrayToCsv(csvData, [
    "parentId",
    "invoiceNumber",
    "issueDate",
    "dueDate",
    "totalAmount",
    "status",
    "pdfUrl",
  ]);
}
