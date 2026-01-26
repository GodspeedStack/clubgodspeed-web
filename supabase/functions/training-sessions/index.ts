// supabase/functions/training-sessions/index.ts
// Training Sessions API - Get sessions with filtering

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
    const status = url.searchParams.get("status") || "scheduled"; // completed | scheduled
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

    // Get athlete enrollments
    const { data: enrollments } = await supabase
      .from("player_enrollments")
      .select("program_id")
      .eq("parent_id", parentAccount.id)
      .eq("athlete_id", athleteId)
      .eq("status", "active");

    const programIds = enrollments?.map((e) => e.program_id) || [];

    if (programIds.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    let query = supabase
      .from("training_sessions")
      .select("*")
      .in("program_id", programIds);

    // Filter by status
    if (status === "completed") {
      // Completed = has attendance record
      const { data: purchases } = await supabase
        .from("training_purchases")
        .select("id")
        .eq("parent_id", parentAccount.id)
        .eq("athlete_id", athleteId);

      const purchaseIds = purchases?.map((p) => p.id) || [];

      if (purchaseIds.length > 0) {
        const { data: attendance } = await supabase
          .from("training_attendance")
          .select("session_id")
          .in("purchase_id", purchaseIds);

        const sessionIds = attendance?.map((a) => a.session_id) || [];
        if (sessionIds.length > 0) {
          query = query.in("id", sessionIds);
        } else {
          return new Response(JSON.stringify([]), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
      } else {
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    } else {
      // Scheduled = no attendance record yet
      query = query.eq("status", "scheduled");
    }

    // Filter by date range
    if (from) {
      query = query.gte("session_date", from);
    }
    if (to) {
      query = query.lte("session_date", to);
    }

    // Order by date
    query = query.order("session_date", { ascending: status === "completed" ? false : true });

    const { data: sessions, error } = await query;

    if (error) throw error;

    // Enrich with attendance data for completed sessions
    if (status === "completed" && sessions) {
      const { data: purchases } = await supabase
        .from("training_purchases")
        .select("id")
        .eq("parent_id", parentAccount.id)
        .eq("athlete_id", athleteId);

      const purchaseIds = purchases?.map((p) => p.id) || [];

      if (purchaseIds.length > 0) {
        const { data: attendance } = await supabase
          .from("training_attendance")
          .select("*, training_sessions(*)")
          .in("purchase_id", purchaseIds);

        // Merge attendance data with sessions
        const sessionMap = new Map(sessions.map((s) => [s.id, s]));
        attendance?.forEach((att) => {
          if (sessionMap.has(att.session_id)) {
            const session = sessionMap.get(att.session_id);
            session.attendance = att;
          }
        });
      }
    }

    return new Response(JSON.stringify(sessions || []), {
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
