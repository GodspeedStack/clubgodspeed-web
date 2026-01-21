import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function errorResponse(code: string, message: string, status = 400, details: Record<string, unknown> = {}) {
  return jsonResponse({ error: { code, message, details } }, status);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return errorResponse("SERVER_ERROR", "Supabase environment is not configured.", 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return errorResponse("UNAUTHENTICATED", "Missing access token.", 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return errorResponse("UNAUTHENTICATED", "Invalid access token.", 401);
  }

  const userId = authData.user.id;
  const url = new URL(req.url);
  const basePath = "/functions/v1/training-api";
  const path = url.pathname.startsWith(basePath)
    ? url.pathname.slice(basePath.length)
    : url.pathname;

  if (req.method !== "GET") {
    return errorResponse("METHOD_NOT_ALLOWED", "Only GET is supported.", 405);
  }

  if (path !== "" && path !== "/" && path !== "/dashboard") {
    return errorResponse("NOT_FOUND", "Endpoint not found.", 404);
  }

  const athleteId = url.searchParams.get("athleteId") || undefined;

  const { data: parentAccount } = await supabase
    .from("parent_accounts")
    .select("id,email")
    .eq("user_id", userId)
    .maybeSingle();

  const resolvedParent = parentAccount
    ? parentAccount
    : authData.user.email
    ? await supabase
        .from("parent_accounts")
        .select("id,email")
        .eq("email", authData.user.email)
        .maybeSingle()
        .then((res) => res.data)
    : null;

  if (!resolvedParent) {
    return errorResponse("NOT_FOUND", "Parent account not found.", 404);
  }

  let purchaseQuery = supabase
    .from("training_purchases")
    .select("id,athlete_id,hours_purchased,hours_used,hours_remaining,status,purchase_date,expiry_date")
    .eq("parent_id", resolvedParent.id);

  if (athleteId) {
    purchaseQuery = purchaseQuery.eq("athlete_id", athleteId);
  }

  const { data: purchases, error: purchasesError } = await purchaseQuery;
  if (purchasesError) {
    return errorResponse("SERVER_ERROR", "Failed to load training purchases.", 500, { message: purchasesError.message });
  }

  const purchaseIds = (purchases || []).map((p) => p.id);
  const totalPurchased = (purchases || []).reduce((sum, p) => sum + Number(p.hours_purchased || 0), 0);
  const totalUsed = (purchases || []).reduce((sum, p) => sum + Number(p.hours_used || 0), 0);
  const totalRemaining = (purchases || []).reduce((sum, p) => sum + Number(p.hours_remaining || 0), 0);

  const { data: attendance } = purchaseIds.length
    ? await supabase
        .from("training_attendance")
        .select(
          "id,hours_used,attendance_status,notes,attended_at,session:training_sessions(id,session_date,start_time,end_time,title,status,focus,description,location,program_id)"
        )
        .in("purchase_id", purchaseIds)
        .order("attended_at", { ascending: false })
    : { data: [] };

  let enrollmentQuery = supabase
    .from("player_enrollments")
    .select("id,athlete_id,program_id,program_name,program_type,status,enrolled_sessions,start_date,end_date")
    .eq("parent_id", resolvedParent.id);

  if (athleteId) {
    enrollmentQuery = enrollmentQuery.eq("athlete_id", athleteId);
  }

  const { data: enrollments, error: enrollmentsError } = await enrollmentQuery;
  if (enrollmentsError) {
    return errorResponse("SERVER_ERROR", "Failed to load enrollments.", 500, { message: enrollmentsError.message });
  }

  const programIds = Array.from(new Set((enrollments || []).map((e) => e.program_id).filter(Boolean)));

  const { data: programs } = programIds.length
    ? await supabase
        .from("training_programs")
        .select("id,name,program_type,status,schedule,coach,description,focus")
        .in("id", programIds)
    : { data: [] };

  const programMap = new Map<string, {
    id: string;
    name: string;
    program_type: string | null;
    status: string | null;
    schedule: string | null;
    coach: string | null;
    description: string | null;
    focus: unknown;
  }>();

  (programs || []).forEach((program) => programMap.set(program.id, program));

  const normalizedPrograms = programIds.map((programId) => {
    const program = programMap.get(programId);
    const enrollment = (enrollments || []).find((e) => e.program_id === programId);
    return {
      id: programId,
      name: program?.name || enrollment?.program_name || programId,
      type: program?.program_type || enrollment?.program_type || null,
      status: program?.status || enrollment?.status || null,
      schedule: program?.schedule || null,
      coach: program?.coach || null,
      description: program?.description || null,
      focus: Array.isArray(program?.focus) ? program?.focus : []
    };
  });

  const today = new Date().toISOString().split("T")[0];
  const { data: upcomingSessions } = programIds.length
    ? await supabase
        .from("training_sessions")
        .select("id,session_date,start_time,end_time,title,status,focus,description,location,program_id")
        .in("program_id", programIds)
        .gte("session_date", today)
        .order("session_date", { ascending: true })
    : { data: [] };

  const { data: globalDocs } = await supabase
    .from("training_documents")
    .select("id,program_id,title,doc_type,doc_date,link")
    .is("program_id", null);

  const { data: programDocs } = programIds.length
    ? await supabase
        .from("training_documents")
        .select("id,program_id,title,doc_type,doc_date,link")
        .in("program_id", programIds)
    : { data: [] };

  const { data: receipts } = await supabase
    .from("receipts")
    .select("id,receipt_number,amount,payment_method,payment_date,items,pdf_url")
    .eq("parent_id", resolvedParent.id)
    .order("payment_date", { ascending: false });

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id,invoice_number,issue_date,due_date,total_amount,status,paid_at,pdf_url,line_items")
    .eq("parent_id", resolvedParent.id)
    .order("issue_date", { ascending: false });

  return jsonResponse({
    athleteId: athleteId || null,
    parentEmail: resolvedParent.email,
    hours: {
      purchased: totalPurchased,
      used: totalUsed,
      remaining: totalRemaining
    },
    purchases: purchases || [],
    completedSessions: (attendance || []).map((row) => ({
      attendanceId: row.id,
      hoursUsed: Number(row.hours_used || 0),
      status: row.attendance_status,
      notes: row.notes,
      attendedAt: row.attended_at,
      session: row.session
        ? {
            id: row.session.id,
            date: row.session.session_date,
            startTime: row.session.start_time,
            endTime: row.session.end_time,
            programId: row.session.program_id,
            program: programMap.get(row.session.program_id || "")?.name || row.session.title,
            focus: row.session.focus || row.session.description || null,
            status: row.session.status,
            location: row.session.location
          }
        : null
    })),
    upcomingSessions: (upcomingSessions || []).map((session) => ({
      id: session.id,
      date: session.session_date,
      startTime: session.start_time,
      endTime: session.end_time,
      programId: session.program_id,
      program: programMap.get(session.program_id || "")?.name || session.title,
      focus: session.focus || session.description || null,
      status: session.status,
      location: session.location
    })),
    programs: normalizedPrograms,
    documents: [...(globalDocs || []), ...(programDocs || [])],
    receipts: receipts || [],
    invoices: invoices || []
  });
});
