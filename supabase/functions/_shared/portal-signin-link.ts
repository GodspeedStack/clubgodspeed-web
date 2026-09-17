// ============================================================
// Shared: one-tap portal sign-in links for parent emails.
//
// Contract:
//   mintPortalLink(admin, email, destination) -> { url, oneTap }
//   - url    : the href to put in the email button
//   - oneTap : true when url carries a single-use sign-in token that the portal
//              page verifies in the browser; false when we fell back to the
//              plain portal URL (parent will see the login screen).
//
// v2 (2026-09-15): the link is <destination>&token_hash=...&type=magiclink and
//   the portal page calls supabase.auth.verifyOtp() itself. The old
//   action_link form (auth/v1/verify?token=...) was spent by email link
//   scanners before parents tapped it, and every mint replaced the previous
//   token for that parent, so a parent who got several emails in one run held
//   several dead links. Callers must mint ONE link per parent per run.
//
// Rules:
//   - Never throws. Email delivery must not depend on link minting.
//   - Never logs the minted link (it is a bearer credential).
//   - `destination` must be on the portal origin.
//   - Link TTL is the project's Email OTP expiry (Auth > Email). Recommended 24h
//     for parent reminder mail; the portal handles expiry with a fresh-link prompt.
// ============================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

export interface PortalLink {
  url: string;
  oneTap: boolean;
}

export function portalBaseUrl(): string {
  const site = (Deno.env.get("SITE_URL") ?? "https://www.clubgodspeed.com").replace(/\/+$/, "");
  return `${site}/parent-portal.html`;
}

export function documentDeepLink(docSlug: string, agreementId: string): string {
  const qs = new URLSearchParams({ tab: "documents", doc: docSlug, aid: agreementId });
  return `${portalBaseUrl()}?${qs.toString()}`;
}

export function documentsTabLink(): string {
  return `${portalBaseUrl()}?tab=documents`;
}

export async function mintPortalLink(
  admin: SupabaseClient,
  email: string,
  destination: string,
): Promise<PortalLink> {
  const fallback: PortalLink = { url: destination, oneTap: false };
  if (!email || !destination.startsWith(portalBaseUrl())) return fallback;

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: destination },
    });
    const tokenHash = data?.properties?.hashed_token;
    const actionLink = data?.properties?.action_link;
    if (error || (!tokenHash && !actionLink)) {
      console.warn("[portal-link] generateLink failed; using plain portal link.", {
        code: error?.code ?? error?.name ?? "no_token",
        // Log the domain only. Never the address or the link.
        domain: email.split("@")[1] ?? "?",
      });
      return fallback;
    }
    // PORTAL_LINK_MODE=token_hash once the portal page verifies token_hash
    // itself (parent-portal.js handleTokenHashLink). Until then the classic
    // action_link (auth/v1/verify) keeps working with the live portal.
    const mode = (Deno.env.get("PORTAL_LINK_MODE") ?? "action_link").toLowerCase();
    if (mode === "token_hash" && tokenHash) {
      const joiner = destination.includes("?") ? "&" : "?";
      return { url: `${destination}${joiner}token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`, oneTap: true };
    }
    if (!actionLink) return fallback;
    return { url: actionLink, oneTap: true };
  } catch (err) {
    console.warn("[portal-link] generateLink threw; using plain portal link.", err instanceof Error ? err.message : String(err));
    return fallback;
  }
}

/** Parent-facing copy under the button. 6th grade reading level, no em dashes. */
export function linkHelpCopy(link: PortalLink, athleteName: string): string {
  if (link.oneTap) {
    return `This button signs you in. No password needed. It works one time and expires in 24 hours. ` +
      `If it has expired, open clubgodspeed.com/parent-portal.html, type your email, and tap ` +
      `"Email me a sign-in link" to get a fresh one.`;
  }
  return `This link opens ${athleteName}'s Parent Portal on clubgodspeed.com. ` +
    `You do not need a password: type your email on the sign-in page and tap "Email me a sign-in link".`;
}
