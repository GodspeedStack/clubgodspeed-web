/**
 * caller-auth — who is calling an edge function deployed with verify_jwt=false.
 *
 * Turning off the gateway's JWT check is necessary for anything a provider or a
 * cron calls, but it is only safe when the function does its own check. Three
 * email-sending functions were deployed with verify_jwt=false and no check at
 * all, which made them anonymous relays on the club's sending domain.
 *
 * This is the pattern already proven in send-document-notification v2.1,
 * lifted out so no future function has to reinvent it (or forget it).
 *
 * The role is ALWAYS read from public.profiles. A JWT's own claims are supplied
 * by the token holder and are not evidence of anything.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

export type Caller =
  | { kind: "service" }
  | { kind: "cron" }
  | { kind: "staff"; userId: string; role: string }
  | { kind: "parent"; userId: string };

const STAFF_ROLES: ReadonlySet<string> = new Set(["director", "coach", "founder"]);

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Purpose-scoped secret for scheduled callers. Deliberately not the service
// role key: a cron only needs to trigger one job, and app.settings values are
// readable by anything with database access.
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

// Created at module scope with no type annotation, exactly as
// send-document-notification does. Annotating it `ReturnType<typeof
// createClient>` resolves the generics to their defaults, which leaves the
// schema type empty and makes every .from("profiles") call fail to compile.
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Constant-time compare, so a secret cannot be probed byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

/**
 * Resolve the caller, or null when it cannot be established.
 *
 * Fail-closed by construction: an unset SERVICE_ROLE_KEY or CRON_SECRET can
 * never match, because the empty string is rejected before comparison.
 */
export async function resolveCaller(req: Request): Promise<Caller | null> {
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  if (CRON_SECRET && cronHeader && timingSafeEqual(cronHeader, CRON_SECRET)) {
    return { kind: "cron" };
  }

  const token = bearer(req);
  if (!token) return null;

  if (SERVICE_ROLE_KEY && timingSafeEqual(token, SERVICE_ROLE_KEY)) {
    return { kind: "service" };
  }

  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return null;

  const { data: profile } = await admin
    .from("profiles").select("role").eq("id", user.id).maybeSingle();

  const role = (profile?.role ?? "") as string;
  return STAFF_ROLES.has(role)
    ? { kind: "staff", userId: user.id, role }
    : { kind: "parent", userId: user.id };
}

/** True for callers allowed to make the club send mail to families. */
export function canSendClubMail(c: Caller | null): boolean {
  return !!c && (c.kind === "service" || c.kind === "cron" || c.kind === "staff");
}

export function unauthorized(fn: string, c: Caller | null): Response {
  // Presence only, never values. Without this an unset secret and a genuinely
  // bad token are indistinguishable from outside: correct against an attacker,
  // useless to an operator.
  console.warn(
    `${fn}: rejected caller (kind=${c?.kind ?? "none"}; ` +
    `SERVICE_ROLE_KEY set=${SERVICE_ROLE_KEY ? "yes" : "NO"}, ` +
    `CRON_SECRET set=${CRON_SECRET ? "yes" : "NO"})`,
  );
  return new Response(
    JSON.stringify({ error: { code: "unauthorized", message: "Not permitted" } }),
    { status: c ? 403 : 401, headers: { "Content-Type": "application/json" } },
  );
}
