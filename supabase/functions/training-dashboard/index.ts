// supabase/functions/training-dashboard/index.ts
// Training Dashboard API - Source of truth for dashboard metrics

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required", code: "AUTH_REQUIRED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
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

    // Get query parameters
    const url = new URL(req.url);
    const athleteId = url.searchParams.get("athleteId");

    if (!athleteId) {
      return new Response(
        JSON.stringify({ error: "athleteId parameter required", code: "VALIDATION_ERROR" }),
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

    // Verify athlete ownership
    const { data: purchase, error: purchaseError } = await supabase
      .from("training_purchases")
      .select("athlete_id")
      .eq("parent_id", parentAccount.id)
      .eq("athlete_id", athleteId)
      .limit(1)
      .single();

    if (purchaseError || !purchase) {
      return new Response(
        JSON.stringify({ error: "Athlete not found or access denied", code: "FORBIDDEN" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get hours data
    const { data: purchases, error: purchasesError } = await supabase
      .from("training_purchases")
      .select("hours_purchased, hours_used, hours_remaining")
      .eq("parent_id", parentAccount.id)
      .eq("athlete_id", athleteId)
      .eq("status", "active");

    if (purchasesError) throw purchasesError;

    const hoursPurchased = purchases?.reduce((sum, p) => sum + parseFloat(p.hours_purchased || 0), 0) || 0;
    const hoursUsed = purchases?.reduce((sum, p) => sum + parseFloat(p.hours_used || 0), 0) || 0;
    const hoursRemaining = hoursPurchased - hoursUsed;

    // Get completed sessions count
    const purchaseIds = purchases?.map((p) => p.id) || [];
    const { count: sessionsCompletedCount } = await supabase
      .from("training_attendance")
      .select("*", { count: "exact", head: true })
      .in(
        "purchase_id",
        purchaseIds.length > 0 ? purchaseIds : ["00000000-0000-0000-0000-000000000000"]
      );

    // Get upcoming sessions count
    const { data: enrollments } = await supabase
      .from("player_enrollments")
      .select("program_id")
      .eq("parent_id", parentAccount.id)
      .eq("athlete_id", athleteId)
      .eq("status", "active");

    const programIds = enrollments?.map((e) => e.program_id) || [];
    const today = new Date().toISOString().split("T")[0];

    const { count: upcomingSessionsCount } = await supabase
      .from("training_sessions")
      .select("*", { count: "exact", head: true })
      .in("program_id", programIds.length > 0 ? programIds : ["__no_match__"])
      .gte("session_date", today)
      .eq("status", "scheduled");

    // Get active programs count
    const { count: activeProgramsCount } = await supabase
      .from("player_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("parent_id", parentAccount.id)
      .eq("athlete_id", athleteId)
      .eq("status", "active");

    // Get next session
    const { data: nextSessions } = await supabase
      .from("training_sessions")
      .select("session_date, start_time, title, program_id")
      .in("program_id", programIds.length > 0 ? programIds : ["__no_match__"])
      .gte("session_date", today)
      .eq("status", "scheduled")
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(1);

    let nextSession = null;
    if (nextSessions && nextSessions.length > 0) {
      const session = nextSessions[0];
      // Get program name
      const { data: program } = await supabase
        .from("player_enrollments")
        .select("program_name")
        .eq("program_id", session.program_id)
        .eq("athlete_id", athleteId)
        .single();

      nextSession = {
        date: session.session_date,
        time: session.start_time,
        coach: "Coach", // TODO: Get from program or session metadata
        program: program?.program_name || session.program_id,
      };
    }

    // Build response
    const response = {
      hoursPurchased,
      hoursUsed,
      hoursRemaining,
      sessionsCompletedCount: sessionsCompletedCount || 0,
      upcomingSessionsCount: upcomingSessionsCount || 0,
      activeProgramsCount: activeProgramsCount || 0,
      nextSession,
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
