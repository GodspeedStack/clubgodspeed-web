// ============================================================
// Supabase Edge Function: send-training-report
// Sends branded "Training Report Available" email via Resend.
// Called by admin dashboard when sending a report link to a parent.
//
// Deploy: supabase functions deploy send-training-report
//
// Secrets required:
//   RESEND_API_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_URL
//
// Request body:
//   {
//     athlete_id: uuid,          -- The athlete whose report to send
//     parent_email?: string,     -- Override email (optional; defaults to linked parent)
//   }
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const REPORT_BASE_URL = "https://clubgodspeed.com/athlete-training-report.html";

interface ReportRequest {
  athlete_id: string;
  parent_email?: string;
}

serve(async (req: Request) => {
  // CORS headers for browser requests
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    const body: ReportRequest = await req.json();

    if (!body.athlete_id) {
      return new Response(
        JSON.stringify({ error: "athlete_id is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Fetch athlete + linked parent
    const { data: athlete, error: athleteErr } = await supabase
      .from("athletes")
      .select("id, first_name, last_name, display_name, parent_account_id, team_name, season")
      .eq("id", body.athlete_id)
      .single();

    if (athleteErr || !athlete) {
      return new Response(
        JSON.stringify({ error: "Athlete not found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Resolve parent email
    let parentEmail = body.parent_email;
    if (!parentEmail && athlete.parent_account_id) {
      const { data: parentAccount } = await supabase
        .from("parent_accounts")
        .select("email, user_id")
        .eq("id", athlete.parent_account_id)
        .maybeSingle();

      if (parentAccount?.email) {
        parentEmail = parentAccount.email;
      } else if (parentAccount?.user_id) {
        // Fallback: get email from auth.users
        const { data: { user } } = await supabase.auth.admin.getUserById(parentAccount.user_id);
        parentEmail = user?.email || null;
      }
    }

    if (!parentEmail) {
      return new Response(
        JSON.stringify({ error: "No parent email found. Provide parent_email in the request." }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Build report link
    const reportLink = `${REPORT_BASE_URL}?athlete_id=${athlete.id}`;
    const athleteName = athlete.display_name || athlete.first_name + " " + athlete.last_name;
    const parentFirstName = parentEmail.split("@")[0];

    // Build email
    const subject = `Training Report Ready: ${athleteName}`;
    const html = buildTrainingReportEmail({
      parentName: parentFirstName,
      athleteName,
      teamName: athlete.team_name || "Godspeed Basketball",
      season: athlete.season || "",
      reportLink,
    });

    // Send via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Godspeed Basketball <reports@clubgodspeed.com>",
        to: [parentEmail],
        subject,
        html,
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error("[send-training-report] Resend error:", result);
      return new Response(
        JSON.stringify({ error: "Email delivery failed", detail: result }),
        { status: 502, headers: corsHeaders }
      );
    }

    console.log(`[send-training-report] Sent to ${parentEmail} for ${athleteName}`);

    return new Response(
      JSON.stringify({
        sent: true,
        to: parentEmail,
        athlete: athleteName,
        resend_id: result.id,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("[send-training-report] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});

// ── Email Template ────────────────────────────────────────
interface EmailContext {
  parentName: string;
  athleteName: string;
  teamName: string;
  season: string;
  reportLink: string;
}

function buildTrainingReportEmail(ctx: EmailContext): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:24px;">
        GODSPEED<span style="color:#2563eb;">BASKETBALL</span>
      </div>

      <p style="font-size:16px;line-height:1.6;color:#111;">
        Hey ${ctx.parentName},
      </p>

      <p style="font-size:16px;line-height:1.6;color:#111;">
        A new training report is available for <strong>${ctx.athleteName}</strong>.
      </p>

      <div style="background:#f0f9ff;border-left:4px solid #2563eb;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;">
        <strong>Training Report</strong><br>
        <span style="color:#6b7280;font-size:14px;">
          ${ctx.teamName}${ctx.season ? " -- " + ctx.season : ""}
        </span>
      </div>

      <p style="font-size:16px;line-height:1.6;color:#111;">
        This report includes attendance, training grades, game performance, skill evaluations,
        and coach notes. You can view it online or download it as a PDF.
      </p>

      <a href="${ctx.reportLink}" style="display:inline-block;background:#000;color:#fff;padding:16px 32px;border-radius:6px;font-weight:700;font-size:14px;text-transform:uppercase;text-decoration:none;letter-spacing:0.05em;margin:24px 0;">
        VIEW TRAINING REPORT
      </a>

      <p style="font-size:13px;color:#9ca3af;margin-top:8px;">
        This link takes you to ${ctx.athleteName}'s secure training report on clubgodspeed.com.
        You'll need to sign in to view the full report.
      </p>

      <p style="font-size:14px;line-height:1.6;color:#6b7280;margin-top:24px;">
        Questions? Just reply to this email or text Coach Scott.
      </p>

      <div style="border-top:1px solid #e5e7eb;margin-top:32px;padding-top:16px;font-size:12px;color:#9ca3af;">
        Godspeed Basketball Academy -- Brotherhood. Habits. Success.
      </div>
    </div>
  `;
}
