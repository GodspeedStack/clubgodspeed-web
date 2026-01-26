// supabase/functions/receipts/index.ts
// Receipts API - Canonical receipt data and PDF generation

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Parse URL path: /receipts/:id or /receipts/:id/pdf
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter((p) => p && p !== "index.ts");
    
    if (pathParts.length < 2 || pathParts[0] !== "receipts") {
      return new Response(
        JSON.stringify({ error: "Invalid path format. Expected: /receipts/:id or /receipts/:id/pdf", code: "VALIDATION_ERROR" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const receiptId = pathParts[1];
    const isPdfRequest = pathParts.length > 2 && pathParts[2] === "pdf";

    if (!receiptId) {
      return new Response(
        JSON.stringify({ error: "Receipt ID required", code: "VALIDATION_ERROR" }),
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

    // Load receipt with joined data
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
      .eq("id", receiptId)
      .eq("parent_id", parentAccount.id)
      .single();

    if (receiptError || !receipt) {
      return new Response(
        JSON.stringify({ error: "Receipt not found", code: "NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle PDF request
    if (isPdfRequest) {
      // V1: GET /receipts/:id/pdf
      // Auth required + server-side authorization (already verified above)
      // Don't expose storage URLs directly - stream through secure endpoint
      
      // Always redirect to documents-pdf endpoint which handles:
      // - Caching (checks if PDF exists and is valid)
      // - Generation if needed
      // - Secure streaming (doesn't expose storage URLs)
      const baseUrl = url.origin;
      const pdfUrl = `${baseUrl}/functions/documents-pdf/documents/receipt/${receiptId}/pdf`;
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          Location: pdfUrl,
        },
      });
    }

    // Validate required fields for receipt display (V1 canonical fields)
    // Required: id, parentId, athleteId, receiptNumber, paymentDate, amount, item, status, pdfUrl
    const requiredFields = {
      id: receipt.id,
      parent_id: receipt.parent_id,
      athlete_id: receipt.athlete_id, // Required for new receipts
      receipt_number: receipt.receipt_number,
      payment_date: receipt.payment_date,
      amount: receipt.amount,
      item: receipt.item, // Canonical item field
      status: receipt.status,
      // pdf_url can be null initially (will be generated)
    };

    const missingFields: string[] = [];
    for (const [field, value] of Object.entries(requiredFields)) {
      if (value === null || value === undefined || value === "") {
        missingFields.push(field);
      }
    }
    
    // V1: Enforce athleteId for new receipts (422 if missing)
    if (!receipt.athlete_id) {
      if (!missingFields.includes("athlete_id")) {
        missingFields.push("athlete_id");
      }
    }

    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Required fields missing for receipt",
          code: "VALIDATION_ERROR",
          missing_fields: missingFields,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get athlete data if athleteId exists
    let athleteData: any = null;
    if (receipt.athlete_id) {
      // Try to get athlete name (if athletes table exists)
      // For now, use athleteId as name
      athleteData = {
        id: receipt.athlete_id,
        name: receipt.athlete_id, // Can be enhanced if athletes table exists
      };
    }

    // Build parent name
    const parent = receipt.parent_accounts;
    const parentName = parent?.first_name && parent?.last_name
      ? `${parent.first_name} ${parent.last_name}`
      : parent?.email || "Customer";

    // Build response matching spec exactly
    const response = {
      receipt: {
        receiptNumber: receipt.receipt_number,
        paymentDate: receipt.payment_date,
        amount: receipt.amount?.toString() || "0.00",
        item: receipt.item || // V1: Use canonical item field if available
          (receipt.items && Array.isArray(receipt.items) && receipt.items.length > 0
            ? receipt.items[0].description || receipt.items[0].name || receipt.items[0].title || "Training Package"
            : "Training Package"),
        status: receipt.status || "Paid",
        pdfUrl: receipt.pdf_url || null,
        paymentMethod: receipt.payment_method || null,
        transactionId: receipt.transaction_id || null,
        currency: receipt.currency || "USD",
        refundedAt: receipt.refunded_at || null,
        refundAmount: receipt.refund_amount ? receipt.refund_amount.toString() : null,
      },
      parent: {
        name: parentName,
        email: parent?.email || "",
        phone: parent?.phone || null,
      },
      athlete: athleteData ? {
        name: athleteData.name,
      } : null,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
