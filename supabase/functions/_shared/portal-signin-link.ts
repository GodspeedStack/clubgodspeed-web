// ============================================================
// Shared: one-tap portal sign-in links for parent emails.
//
// Contract:
//   mintPortalLink(admin, email, destination) -> { url, oneTap }
//   - url    : the href to put in the email button
//   - oneTap : true when url is a single-use Supabase magic link that signs the
//              parent in and then redirects to `destination`; false when we fell
//              back to the plain portal URL (parent will see the login screen).
//
// Rules:
//   - Never throws. Email delivery must not depend on link minting.
//   - Never logs the minted link (it is a bearer credential).
//   - `destination` must be on the portal origin and is passed as redirectTo; the
//     Auth "Redirect URLs" allow-list must permit it (same pattern as
//     admin-impersonate: <SITE_URL>/parent-portal.html?...).
//   - Link TTL is the project's Email OTP expiry (Auth > Email). Recommended 24h
//     for parent reminder mail; the portal handles `otp_expired` gracefully.
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
    const link = data?.properties?.action_link;
    if (error || !link) {
      console.warn("[portal-link] generateLink failed; using plain portal link.", {
        code: error?.code ?? error?.name ?? "no_action_link",
        // Log the domain only. Never the address or the link.
        domain: email.split("@")[1] ?? "?",
      });
      return fallback;
    }
    return { url: link, oneTap: true };
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
    `If you do not know your password, type your email on the sign-in page and tap "Email me a sign-in link".`;
}
