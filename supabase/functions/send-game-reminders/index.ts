/**
 * send-game-reminders
 *
 * Tells each family about their own team's games. Two modes:
 *   week_ahead — Thursday, the games in the next 8 days
 *   day_of     — morning of, the games happening today
 *
 * Scoping is the point. A 5th Grade Black parent must not be mailed the 6th
 * Grade tip-off times; that is how parents learn to ignore club email.
 * Recipients resolve through:
 *   calendar_events.team_id -> team_rosters -> parent_player_links -> profiles
 *
 * Every send goes through the parent-comms chokepoint, so each one opens a
 * row in parent_message_log and is visible in the admin Message Ledger.
 *
 * Idempotency is in the database, not here: game_reminder_log carries a
 * partial unique index on (event_id, reminder_kind, recipient_email). This
 * function CLAIMS before it sends, so two overlapping runs cannot both mail
 * the same family. See v25_01_game_reminders.sql.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendParentEmail } from "../_shared/parent-comms.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const SITE_URL = "https://www.clubgodspeed.com";

// Purpose-scoped caller secret. Deliberately NOT the service role key: a cron
// only needs permission to trigger this one job, and app.settings values are
// readable by anything with database access. Least privilege.
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

type Kind = "week_ahead" | "day_of";

interface GameRow {
  id: string;
  title: string;
  start_date: string;   // YYYY-MM-DD, already Denver-local
  start_time: string | null;  // HH:MM:SS, already Denver-local
  location: string | null;
  team_id: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Constant-time compare, so the secret cannot be probed byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Denver dates, formatted WITHOUT going through Date().
 *
 * start_date is a plain date string that already means Denver local time.
 * `new Date("2026-09-26")` parses as UTC midnight, which renders as the 25th
 * in Denver — a reminder for the wrong day. Parsing the parts by hand is the
 * only way this stays correct in every month of the year.
 */
const DOW = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MON = ["January","February","March","April","May","June",
             "July","August","September","October","November","December"];

function dayOfWeek(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  // Zeller-free: UTC math on a date-only value is safe because we only want
  // the weekday index, which is timezone-independent for a civil date.
  return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function prettyDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MON[m - 1]} ${d}`;
}

function prettyTime(hms: string | null): string {
  if (!hms) return "Time TBD";
  const [hStr, mStr] = hms.split(":");
  let h = Number(hStr);
  const suffix = h >= 12 ? "pm" : "am";
  h = h % 12 === 0 ? 12 : h % 12;
  return mStr === "00" ? `${h}${suffix}` : `${h}:${mStr}${suffix}`;
}

/** Today in Denver, as YYYY-MM-DD, without assuming the server's clock zone. */
function denverToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

// ─── email body ─────────────────────────────────────────────────────────────

function buildEmail(
  parentName: string | null,
  teamName: string,
  games: GameRow[],
  kind: Kind,
): { subject: string; html: string } {
  const one = games.length === 1;

  const subject = kind === "day_of"
    ? (one
        ? `Game today — ${prettyTime(games[0].start_time)} at ${games[0].location ?? "TBD"}`
        : `${games.length} games today — ${teamName}`)
    : (one
        ? `${teamName}: game ${prettyDate(games[0].start_date)}`
        : `${teamName}: ${games.length} games coming up`);

  const rows = games.map((g) => `
    <tr><td style="padding:0 0 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td bgcolor="#f5f5f7" style="background-color:#f5f5f7;padding:14px 16px;border-radius:10px;">
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1A3A8F;">
            ${esc(kind === "day_of" ? "Today" : prettyDate(g.start_date))}
          </div>
          <div style="height:6px;font-size:6px;line-height:6px;">&nbsp;</div>
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#1d1d1f;line-height:1.3;">
            ${esc(g.title)}
          </div>
          <div style="height:6px;font-size:6px;line-height:6px;">&nbsp;</div>
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;color:#3a3a3c;line-height:1.5;">
            <strong style="color:#FF5722;">${esc(prettyTime(g.start_time))}</strong>
            &nbsp;&bull;&nbsp; ${esc(g.location ?? "Location TBD")}
          </div>
        </td></tr>
      </table>
    </td></tr>`).join("");

  const lede = kind === "day_of"
    ? (one ? "Game day." : "Two on the schedule today.")
    : (one ? "One on the schedule." : `${games.length} on the schedule.`);

  const html = `<!doctype html><html><body style="margin:0;padding:0;background-color:#f5f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f5f7" style="background-color:#f5f5f7;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;">

    <tr><td bgcolor="#1A3A8F" style="background-color:#1A3A8F;padding:26px 32px;">
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.16em;color:#c3cfea;text-transform:uppercase;">${esc(teamName)}</div>
      <div style="height:8px;font-size:8px;line-height:8px;">&nbsp;</div>
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:24px;line-height:1.15;font-weight:800;letter-spacing:-.02em;color:#ffffff;">${esc(lede)}</div>
    </td></tr>

    <tr><td style="padding:24px 32px 4px;">
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#3a3a3c;">${parentName ? esc(parentName.split(" ")[0]) + "," : "Godspeed Families,"}</div>
      <div style="height:16px;font-size:16px;line-height:16px;">&nbsp;</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
      <div style="height:4px;font-size:4px;line-height:4px;">&nbsp;</div>
      <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#3a3a3c;">Arrive warmed up and ready. If something changes we will send an update here.</div>
    </td></tr>

    <tr><td align="center" style="padding:22px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="#1A3A8F" style="background-color:#1A3A8F;border-radius:999px;">
          <a href="${SITE_URL}/parent-portal.html#calendar" style="display:inline-block;padding:13px 24px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">See the full schedule</a>
        </td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:24px 32px 26px;">
      <div style="border-top:1px solid #ececf0;height:1px;font-size:0;line-height:0;">&nbsp;</div>
      <div style="height:16px;font-size:16px;line-height:16px;">&nbsp;</div>
      <div align="center" style="text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.16em;color:#1d1d1f;">BROTHERHOOD. HABITS. <span style="color:#FF5722;">SUCCESS.</span></div>
    </td></tr>

  </table>
</td></tr></table>
</body></html>`;

  return { subject, html };
}

// ─── handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  // Fail closed. An unset secret must not mean "open to the world" — that is
  // exactly how the existing reminder crons ended up publicly triggerable.
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!CRON_SECRET || !timingSafeEqual(provided, CRON_SECRET)) {
    console.warn(
      "send-game-reminders: rejected caller " +
      `(CRON_SECRET configured: ${CRON_SECRET ? "yes" : "NO"})`,
    );
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let body: { mode?: string; dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const kind: Kind = body.mode === "day_of" ? "day_of" : "week_ahead";
  const dryRun = body.dryRun === true;

  const today = denverToday();
  const from = today;
  const to = kind === "day_of" ? today : addDays(today, 8);

  // 1. the games in window — published, visible, not cancelled
  const { data: games, error: gErr } = await admin
    .from("calendar_events")
    .select("id,title,start_date,start_time,location,team_id")
    .eq("event_type", "game")
    .eq("is_cancelled", false)
    .not("published_at", "is", null)
    .is("recalled_at", null)
    .gte("start_date", from)
    .lte("start_date", to)
    .not("team_id", "is", null)
    .order("start_date")
    .order("start_time");

  if (gErr) {
    console.error("send-game-reminders: game query failed", gErr.message);
    return new Response(JSON.stringify({ error: gErr.message }), { status: 500 });
  }
  if (!games?.length) {
    return new Response(JSON.stringify({ ok: true, kind, games: 0, sent: 0 }), { status: 200 });
  }

  const teamIds = [...new Set(games.map((g) => g.team_id))];

  // 2. team names
  const { data: teams } = await admin
    .from("teams").select("id,name").in("id", teamIds);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name as string]));

  // 3. roster -> athletes -> linked parents -> reachable emails
  const { data: roster } = await admin
    .from("team_rosters").select("team_id,athlete_id")
    .in("team_id", teamIds).is("left_at", null);

  const athleteIds = [...new Set((roster ?? []).map((r) => r.athlete_id))];
  const { data: links } = await admin
    .from("parent_player_links").select("profile_id,athlete_id")
    .in("athlete_id", athleteIds);

  const profileIds = [...new Set((links ?? []).map((l) => l.profile_id))];
  const { data: profiles } = await admin
    .from("profiles").select("id,email,full_name").in("id", profileIds);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const athleteToProfiles = new Map<string, string[]>();
  for (const l of links ?? []) {
    const arr = athleteToProfiles.get(l.athlete_id) ?? [];
    arr.push(l.profile_id);
    athleteToProfiles.set(l.athlete_id, arr);
  }
  const teamToProfiles = new Map<string, Set<string>>();
  for (const r of roster ?? []) {
    const set = teamToProfiles.get(r.team_id) ?? new Set<string>();
    for (const pid of athleteToProfiles.get(r.athlete_id) ?? []) set.add(pid);
    teamToProfiles.set(r.team_id, set);
  }

  // 4. one email per (recipient, team) covering that team's games in window
  const bundles: { email: string; name: string | null; profileId: string;
                   teamId: string; games: GameRow[] }[] = [];

  for (const tid of teamIds) {
    const teamGames = games.filter((g) => g.team_id === tid) as GameRow[];
    for (const pid of teamToProfiles.get(tid) ?? []) {
      const prof = profileById.get(pid);
      const email = (prof?.email ?? "").trim().toLowerCase();
      if (!email || email.startsWith("pending-")) continue;
      bundles.push({ email, name: prof?.full_name ?? null, profileId: pid,
                     teamId: tid, games: teamGames });
    }
  }

  if (dryRun) {
    return new Response(JSON.stringify({
      ok: true, dryRun: true, kind, window: { from, to },
      games: games.length, recipients: bundles.length,
      preview: bundles.map((b) => ({
        to: b.email, team: teamName.get(b.teamId), games: b.games.length,
        subject: buildEmail(b.name, teamName.get(b.teamId) ?? "Godspeed", b.games, kind).subject,
      })),
    }, null, 2), { status: 200, headers: { "content-type": "application/json" } });
  }

  // 5. claim, then send
  let sent = 0, skipped = 0, failed = 0;

  for (const b of bundles) {
    const tName = teamName.get(b.teamId) ?? "Godspeed";

    // Claim every game this email would cover. Whatever the unique index
    // accepts is what this message is allowed to talk about.
    const claimed: { rowId: string; game: GameRow }[] = [];
    for (const g of b.games) {
      const { data: row, error } = await admin
        .from("game_reminder_log")
        .insert({
          event_id: g.id, reminder_kind: kind, recipient_email: b.email,
          profile_id: b.profileId, team_id: b.teamId,
        })
        .select("id").single();
      if (!error && row) claimed.push({ rowId: row.id, game: g });
    }

    if (!claimed.length) { skipped++; continue; }

    const { subject, html } = buildEmail(b.name, tName, claimed.map((c) => c.game), kind);

    const result = await sendParentEmail({
      source: "send-game-reminders",
      purpose: kind === "day_of" ? "game_reminder_day_of" : "game_reminder_week_ahead",
      trigger: "cron",
      to: b.email,
      recipientName: b.name,
      profileId: b.profileId,
      subject,
      html,
      idempotencyKey: `game/${kind}/${claimed[0].game.id}/${b.email}`,
      relatedTable: "calendar_events",
      relatedId: claimed[0].game.id,
      metadata: { team_id: b.teamId, event_ids: claimed.map((c) => c.game.id) },
    });

    const ids = claimed.map((c) => c.rowId);
    if (result.ok) {
      await admin.from("game_reminder_log")
        .update({ message_log_id: result.logId }).in("id", ids);
      sent++;
    } else {
      // Release the claim so the next run can retry this family.
      await admin.from("game_reminder_log")
        .update({ send_failed: true, fail_reason: (result.error ?? "unknown").slice(0, 300) })
        .in("id", ids);
      failed++;
      console.error(`send-game-reminders: send failed for ${b.email}: ${result.error}`);
    }
  }

  return new Response(JSON.stringify({
    ok: true, kind, window: { from, to },
    games: games.length, recipients: bundles.length, sent, skipped, failed,
  }), { status: 200, headers: { "content-type": "application/json" } });
});
