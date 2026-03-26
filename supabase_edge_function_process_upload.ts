// ============================================================
// GODSPEED — Edge Function: process-upload
// AI Auto-Organize: Parse raw input → route to correct tables
// Deploy: supabase functions deploy process-upload
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!; // or ANTHROPIC_API_KEY

interface ParsedTrainingData {
  type: "training";
  session_date: string;
  session_type: string;
  title?: string;
  team_name?: string;
  location?: string;
  duration_minutes?: number;
  focus_areas: string[];
  attendance: Array<{
    player_name: string;
    status: "present" | "absent" | "late" | "excused";
    effort_rating?: number;
    notes?: string;
    drills?: Array<{ drill_name: string; reps?: number; made?: number; attempted?: number }>;
  }>;
  session_notes?: string;
}

interface ParsedGameData {
  type: "game";
  game_date: string;
  game_type: string;
  opponent_name: string;
  team_name?: string;
  is_home: boolean;
  location?: string;
  team_score?: number;
  opponent_score?: number;
  period_scores?: Array<{ period: number; team: number; opponent: number }>;
  player_stats: Array<{
    player_name: string;
    minutes_played?: number;
    points?: number;
    field_goals_made?: number;
    field_goals_attempted?: number;
    three_pointers_made?: number;
    three_pointers_attempted?: number;
    free_throws_made?: number;
    free_throws_attempted?: number;
    offensive_rebounds?: number;
    defensive_rebounds?: number;
    assists?: number;
    turnovers?: number;
    steals?: number;
    blocks?: number;
    fouls?: number;
    coach_notes?: string;
  }>;
  game_notes?: string;
}

type ParsedData = ParsedTrainingData | ParsedGameData;

// -----------------------------------------------------------
// AI PARSING — Send raw input to LLM for structured extraction
// -----------------------------------------------------------
async function parseWithAI(rawInput: string, uploadType: string): Promise<ParsedData> {
  const systemPrompt = `You are a basketball data parser for Godspeed Basketball Club.
You receive raw coaching input (voice transcriptions, quick notes, or structured data) and must extract structured JSON.

RULES:
- Match player names fuzzy (handle nicknames, misspellings)
- Infer session_type from context (practice = team_practice, workout = individual_workout, etc.)
- If game data: extract all stats mentioned. Default missing stats to 0, missing attendance to "present"
- Dates: use ISO format (YYYY-MM-DD). If "today", "yesterday", etc., resolve relative to current date
- Return ONLY valid JSON, no commentary

For TRAINING data, return:
{
  "type": "training",
  "session_date": "YYYY-MM-DD",
  "session_type": "team_practice|individual_workout|skills_clinic|open_gym|film_session|conditioning|scrimmage",
  "title": "optional title",
  "team_name": "team name if mentioned",
  "location": "gym/court name",
  "duration_minutes": number,
  "focus_areas": ["shooting", "ball_handling", etc],
  "attendance": [{"player_name": "...", "status": "present|absent|late|excused", "effort_rating": 1-5, "notes": "...", "drills": [...]}],
  "session_notes": "overall session notes"
}

For GAME data, return:
{
  "type": "game",
  "game_date": "YYYY-MM-DD",
  "game_type": "regular_season|tournament|playoff|scrimmage|exhibition|championship",
  "opponent_name": "...",
  "team_name": "team name if mentioned",
  "is_home": true/false,
  "location": "...",
  "team_score": number,
  "opponent_score": number,
  "period_scores": [{"period": 1, "team": 12, "opponent": 8}],
  "player_stats": [{"player_name": "...", "points": 0, "assists": 0, ...}],
  "game_notes": "..."
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Upload type hint: ${uploadType}\n\nRaw input:\n${rawInput}` },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  const result = await response.json();
  return JSON.parse(result.choices[0].message.content);
}

// -----------------------------------------------------------
// PLAYER NAME MATCHING — Fuzzy match to athlete records
// -----------------------------------------------------------
async function resolveAthleteId(
  supabase: ReturnType<typeof createClient>,
  playerName: string,
  teamId?: string
): Promise<string | null> {
  // Try exact match first
  const { data: exact } = await supabase
    .from("athletes")
    .select("id, first_name, last_name, display_name")
    .or(`display_name.ilike.%${playerName}%,first_name.ilike.%${playerName}%,last_name.ilike.%${playerName}%`)
    .limit(5);

  if (exact && exact.length === 1) return exact[0].id;

  // If multiple matches and team_id provided, narrow by team
  if (exact && exact.length > 1 && teamId) {
    for (const athlete of exact) {
      const { data: roster } = await supabase
        .from("team_rosters")
        .select("id")
        .eq("team_id", teamId)
        .eq("athlete_id", athlete.id)
        .single();
      if (roster) return athlete.id;
    }
  }

  // Return best match or null
  return exact && exact.length > 0 ? exact[0].id : null;
}

// -----------------------------------------------------------
// ROUTE TRAINING DATA — Insert into training_sessions + attendance
// -----------------------------------------------------------
async function routeTrainingData(
  supabase: ReturnType<typeof createClient>,
  parsed: ParsedTrainingData,
  uploadId: string,
  uploadedBy: string
) {
  // Resolve team
  let teamId: string | null = null;
  if (parsed.team_name) {
    const { data: team } = await supabase
      .from("teams")
      .select("id")
      .ilike("name", `%${parsed.team_name}%`)
      .eq("is_active", true)
      .single();
    teamId = team?.id ?? null;
  }

  // Insert training session
  const { data: session, error: sessionError } = await supabase
    .from("training_sessions")
    .insert({
      session_date: parsed.session_date,
      session_type: parsed.session_type,
      title: parsed.title,
      team_id: teamId,
      location: parsed.location,
      duration_minutes: parsed.duration_minutes,
      focus_areas: parsed.focus_areas,
      session_notes: parsed.session_notes,
      raw_input: null, // Already stored on data_uploads
      ai_processed: true,
      ai_processed_at: new Date().toISOString(),
      created_by: uploadedBy,
    })
    .select("id")
    .single();

  if (sessionError) throw sessionError;

  // Insert attendance records
  for (const att of parsed.attendance) {
    const athleteId = await resolveAthleteId(supabase, att.player_name, teamId ?? undefined);
    if (!athleteId) continue; // Skip unmatched players — flag for review

    await supabase.from("training_attendance").insert({
      session_id: session.id,
      athlete_id: athleteId,
      status: att.status,
      effort_rating: att.effort_rating,
      coach_notes: att.notes,
      drills_completed: att.drills ? JSON.stringify(att.drills) : "[]",
    });
  }

  // Update the upload record with routing info
  await supabase
    .from("data_uploads")
    .update({
      target_session_id: session.id,
      target_team_id: teamId,
      ai_status: "completed",
      processed_at: new Date().toISOString(),
    })
    .eq("id", uploadId);

  return session.id;
}

// -----------------------------------------------------------
// ROUTE GAME DATA — Insert into games + player_game_stats
// -----------------------------------------------------------
async function routeGameData(
  supabase: ReturnType<typeof createClient>,
  parsed: ParsedGameData,
  uploadId: string,
  uploadedBy: string
) {
  // Resolve team
  let teamId: string | null = null;
  if (parsed.team_name) {
    const { data: team } = await supabase
      .from("teams")
      .select("id")
      .ilike("name", `%${parsed.team_name}%`)
      .eq("is_active", true)
      .single();
    teamId = team?.id ?? null;
  }

  // Insert game
  const { data: game, error: gameError } = await supabase
    .from("games")
    .insert({
      game_date: parsed.game_date,
      game_type: parsed.game_type,
      team_id: teamId,
      opponent_name: parsed.opponent_name,
      is_home: parsed.is_home,
      location: parsed.location,
      team_score: parsed.team_score,
      opponent_score: parsed.opponent_score,
      period_scores: parsed.period_scores ? JSON.stringify(parsed.period_scores) : "[]",
      game_notes: parsed.game_notes,
      ai_processed: true,
      ai_processed_at: new Date().toISOString(),
      created_by: uploadedBy,
    })
    .select("id")
    .single();

  if (gameError) throw gameError;

  // Insert player stats
  for (const stat of parsed.player_stats) {
    const athleteId = await resolveAthleteId(supabase, stat.player_name, teamId ?? undefined);
    if (!athleteId) continue;

    await supabase.from("player_game_stats").insert({
      game_id: game.id,
      athlete_id: athleteId,
      minutes_played: stat.minutes_played,
      points: stat.points ?? 0,
      field_goals_made: stat.field_goals_made ?? 0,
      field_goals_attempted: stat.field_goals_attempted ?? 0,
      three_pointers_made: stat.three_pointers_made ?? 0,
      three_pointers_attempted: stat.three_pointers_attempted ?? 0,
      free_throws_made: stat.free_throws_made ?? 0,
      free_throws_attempted: stat.free_throws_attempted ?? 0,
      offensive_rebounds: stat.offensive_rebounds ?? 0,
      defensive_rebounds: stat.defensive_rebounds ?? 0,
      assists: stat.assists ?? 0,
      turnovers: stat.turnovers ?? 0,
      steals: stat.steals ?? 0,
      blocks: stat.blocks ?? 0,
      fouls: stat.fouls ?? 0,
      coach_notes: stat.coach_notes,
    });

    // Auto-route to parent account
    const { data: athlete } = await supabase
      .from("athletes")
      .select("parent_account_id")
      .eq("id", athleteId)
      .single();

    if (athlete?.parent_account_id) {
      // Update upload with parent routing
      await supabase
        .from("data_uploads")
        .update({ parent_account_id: athlete.parent_account_id })
        .eq("id", uploadId);
    }
  }

  // Finalize upload record
  await supabase
    .from("data_uploads")
    .update({
      target_game_id: game.id,
      target_team_id: teamId,
      ai_status: "completed",
      processed_at: new Date().toISOString(),
    })
    .eq("id", uploadId);

  return game.id;
}

// -----------------------------------------------------------
// MAIN HANDLER
// -----------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
      },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { upload_id } = await req.json();

    if (!upload_id) {
      return new Response(JSON.stringify({ error: "upload_id required" }), { status: 400 });
    }

    // Fetch the upload record
    const { data: upload, error: fetchError } = await supabase
      .from("data_uploads")
      .select("*")
      .eq("id", upload_id)
      .single();

    if (fetchError || !upload) {
      return new Response(JSON.stringify({ error: "Upload not found" }), { status: 404 });
    }

    // Mark as processing
    await supabase
      .from("data_uploads")
      .update({ ai_status: "processing" })
      .eq("id", upload_id);

    // Parse with AI
    const parsed = await parseWithAI(upload.raw_content, upload.upload_type);

    // Store parsed data
    await supabase
      .from("data_uploads")
      .update({
        ai_parsed_data: parsed,
        ai_processed_at: new Date().toISOString(),
      })
      .eq("id", upload_id);

    // Route to correct tables
    let resultId: string;
    if (parsed.type === "training") {
      resultId = await routeTrainingData(supabase, parsed, upload_id, upload.uploaded_by);
    } else if (parsed.type === "game") {
      resultId = await routeGameData(supabase, parsed, upload_id, upload.uploaded_by);
    } else {
      throw new Error(`Unknown parsed type: ${(parsed as any).type}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        type: parsed.type,
        result_id: resultId,
        upload_id: upload_id,
      }),
      {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (error) {
    // Mark upload as failed
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { upload_id } = await req.clone().json();
      if (upload_id) {
        await supabase
          .from("data_uploads")
          .update({
            ai_status: "failed",
            ai_errors: [(error as Error).message],
          })
          .eq("id", upload_id);
      }
    } catch (_) { /* best effort */ }

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
