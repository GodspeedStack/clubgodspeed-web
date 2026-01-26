// supabase/functions/training-credits-ledger/index.ts
// Training Credits Ledger API - Get credit transaction history

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
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!athleteId) {
      return new Response(
        JSON.stringify({ error: "athleteId parameter required", code: "VALIDATION_ERROR" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get parent account and verify ownership
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

    // Verify athlete ownership
    const { data: purchase } = await supabase
      .from("training_purchases")
      .select("athlete_id")
      .eq("parent_id", parentAccount.id)
      .eq("athlete_id", athleteId)
      .limit(1)
      .single();

    if (!purchase) {
      return new Response(
        JSON.stringify({ error: "Athlete not found or access denied", code: "FORBIDDEN" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query credits ledger
    let query = supabase
      .from("training_credits_ledger")
      .select("*")
      .eq("athlete_id", athleteId);

    // Filter by date range
    if (from) {
      query = query.gte("date", from);
    }
    if (to) {
      query = query.lte("date", to);
    }

    // Order by date ascending (oldest first for running balance)
    query = query.order("date", { ascending: true }).order("created_at", { ascending: true });

    const { data: ledger, error } = await query;

    if (error) throw error;

    // Format response
    const response = (ledger || []).map((entry) => ({
      date: entry.date,
      eventType: entry.event_type,
      hoursDelta: parseFloat(entry.hours_delta),
      runningBalance: parseFloat(entry.running_balance),
      referenceId: entry.reference_id,
      notes: entry.notes,
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
