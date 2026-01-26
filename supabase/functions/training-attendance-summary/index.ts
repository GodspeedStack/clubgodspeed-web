// supabase/functions/training-attendance-summary/index.ts
// Training Attendance Summary API - Get attendance statistics

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

    // Get query parameters
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
    const { data: purchase } = await supabase
      .from("training_purchases")
      .select("athlete_id")
      .eq("parent_id", parentAccount.id)
      .eq("athlete_id", athleteId)
      .limit(1)
      .single();

    if (!purchase) {
      // Also check enrollments
      const { data: enrollment } = await supabase
        .from("player_enrollments")
        .select("athlete_id")
        .eq("parent_id", parentAccount.id)
        .eq("athlete_id", athleteId)
        .limit(1)
        .single();

      if (!enrollment) {
        return new Response(
          JSON.stringify({ error: "Athlete not found or access denied", code: "FORBIDDEN" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get purchases for this athlete to find attendance records
    const { data: purchases } = await supabase
      .from("training_purchases")
      .select("id")
      .eq("parent_id", parentAccount.id)
      .eq("athlete_id", athleteId);

    const purchaseIds = purchases?.map((p) => p.id) || [];

    if (purchaseIds.length === 0) {
      return new Response(
        JSON.stringify({
          completedCount: 0,
          totalEligibleCount: 0,
          attendancePct: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Query training_attendance for this athlete
    // Join with training_sessions to get session dates for filtering
    let attendanceQuery = supabase
      .from("training_attendance")
      .select(`
        id,
        attendance_status,
        training_sessions!inner(
          session_date
        )
      `)
      .eq("athlete_id", athleteId)
      .in("purchase_id", purchaseIds);

    // Filter by date range if provided
    if (from) {
      attendanceQuery = attendanceQuery.gte("training_sessions.session_date", from);
    }
    if (to) {
      attendanceQuery = attendanceQuery.lte("training_sessions.session_date", to);
    }

    const { data: attendance, error: attendanceError } = await attendanceQuery;

    if (attendanceError) throw attendanceError;

    // Count completed sessions (attendance_status = 'present')
    // V1: Use training_attendance.attendance_status, not grades
    const completedCount = attendance?.filter((a) => {
      const status = a.attendance_status;
      return status === "present";
    }).length || 0;

    // Total eligible count = all attendance records (present, absent, excused)
    // This represents all sessions the athlete was eligible/expected to attend
    const totalEligibleCount = attendance?.length || 0;

    // Calculate attendance percentage
    const attendancePct = totalEligibleCount > 0
      ? Math.round((completedCount / totalEligibleCount) * 100)
      : 0;

    return new Response(
      JSON.stringify({
        completedCount,
        totalEligibleCount,
        attendancePct,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message, code: "SERVER_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
