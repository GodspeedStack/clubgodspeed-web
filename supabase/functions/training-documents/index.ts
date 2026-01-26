// supabase/functions/training-documents/index.ts
// Training Documents API - Get standardized documents

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

    const url = new URL(req.url);
    const athleteId = url.searchParams.get("athleteId");
    const type = url.searchParams.get("type"); // receipt | invoice | syllabus

    if (!athleteId) {
      return new Response(
        JSON.stringify({ error: "athleteId parameter required", code: "VALIDATION_ERROR" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get parent account
    const { data: parentAccount } = await supabase
      .from("parent_accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!parentAccount) {
      return new Response(
        JSON.stringify({ error: "Parent account not found", code: "NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query documents
    let query = supabase
      .from("documents")
      .select("*")
      .eq("payer_id", parentAccount.id)
      .eq("athlete_id", athleteId);

    if (type) {
      query = query.eq("type", type);
    }

    query = query.order("date", { ascending: false });

    const { data: documents, error } = await query;

    if (error) throw error;

    // Format response to match standardized model
    const response = (documents || []).map((doc) => ({
      id: doc.id,
      type: doc.type,
      title: doc.title,
      date: doc.date,
      amount: doc.amount ? parseFloat(doc.amount) : null,
      status: doc.status,
      athleteId: doc.athlete_id,
      payerId: doc.payer_id,
      pdfUrl: doc.pdf_url,
      metadata: doc.metadata || {},
    }));

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
