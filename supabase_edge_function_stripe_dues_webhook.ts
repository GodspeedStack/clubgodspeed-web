// ============================================================
// Supabase Edge Function: stripe-dues-webhook
// Handles Stripe webhook events for season dues payments.
// Records payments, updates installment status, advances plan.
//
// Deploy: supabase functions deploy stripe-dues-webhook
// Secrets required:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_URL
//   RESEND_API_KEY
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req: Request) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
  } catch (err) {
    console.error("[webhook] Signature verification failed:", err.message);
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  console.log(`[webhook] Received event: ${event.type} (${event.id})`);

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;

    case "payment_intent.succeeded":
      await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;

    case "payment_intent.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
      break;

    default:
      console.log(`[webhook] Unhandled event type: ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ── Handle successful checkout ─────────────────────────────
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata || {};
  if (metadata.type !== "season_dues") return;

  const enrollmentId = metadata.enrollment_id;
  const installmentNumber = parseInt(metadata.installment_number || "1", 10);

  if (!enrollmentId) {
    console.error("[webhook] No enrollment_id in session metadata");
    return;
  }

  // Record payment (idempotent — skip if already recorded from a retry)
  const installmentId = await getInstallmentId(enrollmentId, installmentNumber);
  const { error: paymentErr } = await supabase.from("dues_payments").upsert(
    {
      enrollment_id: enrollmentId,
      installment_id: installmentId,
      stripe_payment_intent: session.payment_intent as string,
      stripe_checkout_session: session.id,
      amount: (session.amount_total || 0) / 100,
      currency: session.currency || "usd",
      status: "succeeded",
      receipt_url: null, // Will be set by payment_intent.succeeded
    },
    { onConflict: "stripe_payment_intent", ignoreDuplicates: true }
  );

  if (paymentErr) {
    console.error("[webhook] Failed to record payment:", paymentErr);
    return;
  }

  // Mark installment as paid
  await supabase
    .from("dues_installments")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("enrollment_id", enrollmentId)
    .eq("installment_number", installmentNumber);

  // Update enrollment totals
  await updateEnrollmentTotals(enrollmentId);

  // Send confirmation email
  await sendPaymentConfirmation(enrollmentId, installmentNumber, (session.amount_total || 0) / 100);

  console.log(`[webhook] Payment recorded for enrollment ${enrollmentId}, installment ${installmentNumber}`);
}

// ── Handle PaymentIntent success (for receipt URL) ─────────
async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const metadata = paymentIntent.metadata || {};
  if (metadata.type !== "season_dues") return;

  // Retrieve the latest charge for the receipt URL
  if (paymentIntent.latest_charge) {
    try {
      const charge = await stripe.charges.retrieve(paymentIntent.latest_charge as string);
      if (charge.receipt_url) {
        await supabase
          .from("dues_payments")
          .update({ receipt_url: charge.receipt_url })
          .eq("stripe_payment_intent", paymentIntent.id);
      }
    } catch (err) {
      console.error("[webhook] Failed to fetch charge receipt:", err);
    }
  }
}

// ── Handle failed payment ──────────────────────────────────
async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const metadata = paymentIntent.metadata || {};
  if (metadata.type !== "season_dues") return;

  const enrollmentId = metadata.enrollment_id;
  if (!enrollmentId) return;

  // Record the failed attempt
  await supabase.from("dues_payments").insert({
    enrollment_id: enrollmentId,
    stripe_payment_intent: paymentIntent.id,
    amount: (paymentIntent.amount || 0) / 100,
    currency: paymentIntent.currency || "usd",
    status: "failed",
  });

  console.log(`[webhook] Payment FAILED for enrollment ${enrollmentId}`);
}

// ── Helper: get installment ID by number ───────────────────
async function getInstallmentId(enrollmentId: string, installmentNumber: number): Promise<string | null> {
  const { data } = await supabase
    .from("dues_installments")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .eq("installment_number", installmentNumber)
    .single();

  return data?.id || null;
}

// ── Helper: recalculate enrollment totals ──────────────────
async function updateEnrollmentTotals(enrollmentId: string) {
  const { data: payments } = await supabase
    .from("dues_payments")
    .select("amount")
    .eq("enrollment_id", enrollmentId)
    .eq("status", "succeeded");

  const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);

  const { data: enrollment } = await supabase
    .from("parent_dues_enrollment")
    .select("total_owed")
    .eq("id", enrollmentId)
    .single();

  const newStatus = totalPaid >= (enrollment?.total_owed || 0) ? "paid_in_full" : "active";

  await supabase
    .from("parent_dues_enrollment")
    .update({ total_paid: totalPaid, status: newStatus })
    .eq("id", enrollmentId);
}

// ── Helper: send payment confirmation email via Resend ─────
async function sendPaymentConfirmation(
  enrollmentId: string,
  installmentNumber: number,
  amount: number
) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.warn("[webhook] RESEND_API_KEY not set — skipping confirmation email");
    return;
  }

  // Fetch enrollment details
  const { data: enrollment } = await supabase
    .from("parent_dues_enrollment")
    .select(`
      parent_email, parent_name, athlete_name, total_owed, total_paid,
      payment_plan_templates!inner(plan_name, num_installments)
    `)
    .eq("id", enrollmentId)
    .single();

  if (!enrollment) return;

  const parentName = enrollment.parent_name || "Parent";
  const firstName = parentName.split(" ")[0];
  const athleteName = enrollment.athlete_name || "your athlete";
  const planName = enrollment.payment_plan_templates?.plan_name || "Payment Plan";
  const totalInstallments = enrollment.payment_plan_templates?.num_installments || 1;
  const remaining = Math.max(0, enrollment.total_owed - (enrollment.total_paid + amount));

  const isFullyPaid = remaining <= 0;

  const subject = isFullyPaid
    ? `You're all set! ${athleteName}'s season dues are paid in full`
    : `Payment received — ${athleteName}'s Godspeed dues`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
      <div style="font-size: 20px; font-weight: 700; margin-bottom: 24px;">
        GODSPEED<span style="color: #2563eb;">BASKETBALL</span>
      </div>

      <p style="font-size: 16px; line-height: 1.6; color: #111;">
        Hey ${firstName},
      </p>

      <p style="font-size: 16px; line-height: 1.6; color: #111;">
        ${isFullyPaid
          ? `Just confirming — we received your final payment of <strong>$${amount.toFixed(2)}</strong> for ${athleteName}'s season. You're completely squared away. Thank you for being part of Godspeed this season.`
          : `We received your payment of <strong>$${amount.toFixed(2)}</strong> for ${athleteName}'s ${planName}. That's installment ${installmentNumber} of ${totalInstallments} — you're on track.`
        }
      </p>

      ${!isFullyPaid ? `
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">
        <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">Remaining balance</div>
        <div style="font-size: 24px; font-weight: 700; color: #111;">$${remaining.toFixed(2)}</div>
      </div>
      ` : ""}

      <p style="font-size: 14px; line-height: 1.6; color: #6b7280; margin-top: 24px;">
        If you have any questions, just reply to this email or reach out to Coach Scott directly.
      </p>

      <div style="border-top: 1px solid #e5e7eb; margin-top: 32px; padding-top: 16px; font-size: 12px; color: #9ca3af;">
        Godspeed Basketball Academy — Brotherhood. Habits. Success.
      </div>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Godspeed Basketball <dues@clubgodspeed.com>",
        to: [enrollment.parent_email],
        subject,
        html,
      }),
    });

    const result = await res.json();
    console.log("[webhook] Confirmation email sent:", result.id);
  } catch (err) {
    console.error("[webhook] Failed to send confirmation email:", err);
  }
}
