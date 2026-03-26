// ============================================================
// Supabase Edge Function: create-dues-checkout
// Creates a Stripe Checkout Session for season dues payment.
// Supports both pay-in-full and installment plans.
//
// Deploy: supabase functions deploy create-dues-checkout
// Secrets required:
//   STRIPE_SECRET_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_URL
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2023-10-16",
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const {
      parent_email,
      parent_name,
      athlete_name,
      athlete_id,
      dues_config_id,
      plan_template_id,
      success_url,
      cancel_url,
    } = body;

    // ── Validate required fields ──────────────────────────
    if (!parent_email || !dues_config_id || !plan_template_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: parent_email, dues_config_id, plan_template_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch dues config ─────────────────────────────────
    const { data: duesConfig, error: duesErr } = await supabase
      .from("season_dues_config")
      .select("*")
      .eq("id", dues_config_id)
      .eq("is_active", true)
      .single();

    if (duesErr || !duesConfig) {
      return new Response(
        JSON.stringify({ error: "Invalid or inactive dues configuration" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch plan template ───────────────────────────────
    const { data: planTemplate, error: planErr } = await supabase
      .from("payment_plan_templates")
      .select("*")
      .eq("id", plan_template_id)
      .eq("dues_config_id", dues_config_id)
      .eq("is_active", true)
      .single();

    if (planErr || !planTemplate) {
      return new Response(
        JSON.stringify({ error: "Invalid or inactive payment plan" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Check for existing enrollment (idempotency) ───────
    const { data: existingEnrollment } = await supabase
      .from("parent_dues_enrollment")
      .select("id, status, total_paid")
      .eq("parent_email", parent_email)
      .eq("dues_config_id", dues_config_id)
      .single();

    if (existingEnrollment && existingEnrollment.status === "paid_in_full") {
      return new Response(
        JSON.stringify({ error: "Dues already paid in full for this season" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Create or retrieve Stripe customer ────────────────
    const customers = await stripe.customers.list({ email: parent_email, limit: 1 });
    let customer: Stripe.Customer;

    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: parent_email,
        name: parent_name || undefined,
        metadata: {
          athlete_name: athlete_name || "",
          source: "godspeed_season_dues",
        },
      });
    }

    // ── Determine payment amount ──────────────────────────
    // For pay-in-full: charge the full amount
    // For installment plans: charge the first installment
    const isPayInFull = planTemplate.num_installments === 1;
    const chargeAmount = isPayInFull
      ? duesConfig.total_amount
      : planTemplate.installment_amount;

    const installmentLabel = isPayInFull
      ? "Pay in Full"
      : `Installment 1 of ${planTemplate.num_installments}`;

    // ── Create enrollment record ──────────────────────────
    let enrollmentId: string;

    if (existingEnrollment) {
      enrollmentId = existingEnrollment.id;
      // Update plan if switching
      await supabase
        .from("parent_dues_enrollment")
        .update({
          plan_template_id,
          total_owed: duesConfig.total_amount + planTemplate.convenience_fee,
          status: "active",
        })
        .eq("id", enrollmentId);
    } else {
      const { data: enrollment, error: enrollErr } = await supabase
        .from("parent_dues_enrollment")
        .insert({
          parent_email,
          parent_name: parent_name || null,
          athlete_name: athlete_name || null,
          athlete_id: athlete_id || null,
          dues_config_id,
          plan_template_id,
          total_owed: duesConfig.total_amount + planTemplate.convenience_fee,
        })
        .select("id")
        .single();

      if (enrollErr || !enrollment) {
        throw new Error(`Failed to create enrollment: ${enrollErr?.message}`);
      }
      enrollmentId = enrollment.id;
    }

    // ── Generate installment schedule ─────────────────────
    // Clear any existing unpaid installments (in case of plan switch)
    await supabase
      .from("dues_installments")
      .delete()
      .eq("enrollment_id", enrollmentId)
      .eq("status", "pending");

    const installments = [];
    const startDate = new Date();

    for (let i = 0; i < planTemplate.num_installments; i++) {
      const dueDate = new Date(startDate);
      if (i === 0) {
        // First installment due now
        dueDate.setDate(dueDate.getDate());
      } else {
        dueDate.setDate(dueDate.getDate() + planTemplate.frequency_days * i);
      }

      installments.push({
        enrollment_id: enrollmentId,
        installment_number: i + 1,
        amount: planTemplate.installment_amount,
        due_date: dueDate.toISOString().split("T")[0],
        status: i === 0 ? "pending" : "pending",
      });
    }

    await supabase.from("dues_installments").insert(installments);

    // ── Create Stripe Checkout Session ────────────────────
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: duesConfig.currency,
            unit_amount: Math.round(chargeAmount * 100), // cents
            product_data: {
              name: `Godspeed ${duesConfig.program} — ${duesConfig.season}`,
              description: `${installmentLabel}${
                !isPayInFull
                  ? ` ($${planTemplate.installment_amount}/mo × ${planTemplate.num_installments})`
                  : ""
              }`,
              metadata: {
                season: duesConfig.season,
                program: duesConfig.program,
              },
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        enrollment_id: enrollmentId,
        installment_number: "1",
        dues_config_id,
        plan_template_id,
        type: "season_dues",
      },
      customer_email: undefined, // already set via customer object
      success_url: success_url || "https://clubgodspeed.com/dues-success.html?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: cancel_url || "https://clubgodspeed.com/season-dues.html",
      payment_intent_data: {
        metadata: {
          enrollment_id: enrollmentId,
          installment_number: "1",
          type: "season_dues",
        },
      },
    });

    return new Response(
      JSON.stringify({
        url: session.url,
        session_id: session.id,
        enrollment_id: enrollmentId,
        amount_charged: chargeAmount,
        installment_label: installmentLabel,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[create-dues-checkout] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
