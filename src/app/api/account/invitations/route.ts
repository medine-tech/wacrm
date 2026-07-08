// ============================================================
// /api/account/invitations
//
//   GET  — list outstanding (un-redeemed, non-expired) invites.
//   POST — create a new invite link.
//
// Both admin+. The list endpoint is what the Members tab uses to
// populate the "Pending invitations" section; create is what the
// "Invite member" dialog calls.
//
// IMPORTANT: the plaintext token is returned exactly ONCE — in
// the POST response. We store only the SHA-256 hash on the row,
// so neither GET nor a future PATCH can ever resurface the
// link. The admin sees it in the creation modal, copies it, and
// shares it via WhatsApp/Slack/whatever they like. If they
// dismiss the modal without copying, the only recourse is to
// revoke and re-issue.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import {
  clampExpiryDays,
  generateInviteToken,
  inviteExpiresAt,
  inviteUrl,
} from "@/lib/auth/invitations";
import { isAccountRole } from "@/lib/auth/roles";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { buildInviteEmail } from "@/lib/email/invite-email";

// Resolve the base URL we publish invite links under.
//
// Resolution order, first match wins:
//
//   1. `NEXT_PUBLIC_SITE_URL` — admin's explicit config. Trumps
//      everything; if you set this, that's where links point.
//   2. `X-Forwarded-Host` (+ `X-Forwarded-Proto`) — set by every
//      reverse proxy in front of the app: Hostinger Managed
//      Node.js, Vercel, Cloudflare, nginx. This is what makes
//      invite links Just Work in production without forcing the
//      operator to set an env var.
//   3. `Host` header + the protocol the request arrived on —
//      bare deployments without a proxy.
//   4. Nothing resolved → the POST fails with a 500 telling the
//      operator to set `NEXT_PUBLIC_SITE_URL`. We never emit a
//      link pointing at a host this deployment doesn't own.
//
// Defense-in-depth: `ALLOWED_INVITE_HOSTS`
//
//   The request-header path (#2 and #3 above) trusts whatever
//   hostname the client (or proxy) puts in the header. On a
//   typical proxied deploy (Vercel / Hostinger / Cloudflare) the
//   proxy overwrites these so they're trustworthy. On a bare
//   deployment exposed to the public internet, an attacker could
//   POST directly with a crafted `Host: phishing.example` and
//   receive an invite URL pointing at their site.
//
//   When `ALLOWED_INVITE_HOSTS` is set (comma-separated hostnames),
//   we validate the derived host against the list. Anything not
//   on the list is rejected with a loud console.warn and the POST
//   fails. Operators who care about this attack surface should set
//   this to their canonical hostnames; everyone else gets today's
//   permissive behavior.
//
// Previous implementations hard-defaulted to `https://wacrm.tech`
// (the upstream project's marketing site, a different repo).
// Deployments that didn't set `NEXT_PUBLIC_SITE_URL` got invite
// links pointing at a third-party domain, which 404s on
// `/join/<token>`. Failing loudly removes the foot-gun.
function parseAllowedHosts(): readonly string[] | null {
  const raw = process.env.ALLOWED_INVITE_HOSTS?.trim();
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

function isHostAllowed(
  hostname: string,
  allowList: readonly string[] | null,
): boolean {
  if (!allowList) return true; // No allow-list → permissive (legacy behavior).
  return allowList.includes(hostname.toLowerCase());
}

function getBaseUrl(request: Request): string | null {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const allowList = parseAllowedHosts();
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  if (forwardedHost && isHostAllowed(forwardedHost, allowList)) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  const host = request.headers.get("host")?.trim();
  if (host && isHostAllowed(host, allowList)) {
    // The protocol on `request.url` is whatever the framework saw —
    // reliable for bare deployments where no proxy is rewriting it.
    const reqProto = new URL(request.url).protocol.replace(":", "");
    return `${reqProto}://${host}`;
  }

  // We fall through here when EITHER no Host header was present at
  // all (essentially impossible from a real browser) OR an
  // ALLOWED_INVITE_HOSTS list was set and neither candidate matched
  // it. The warning is the operator's signal that someone is
  // probing the API with a spoofed Host header.
  if (allowList && (forwardedHost || host)) {
    console.warn(
      "[POST /api/account/invitations] rejected non-allow-listed host:",
      { forwardedHost, host, allowList },
    );
  } else {
    console.warn(
      "[POST /api/account/invitations] could not derive base URL from request; set NEXT_PUBLIC_SITE_URL",
    );
  }
  return null;
}

const MAX_LABEL_LEN = 80;
const MAX_EMAIL_LEN = 254;

// Durable per-account cap on outbound invite emails. The in-memory
// checkRateLimit budget is per-lambda-instance and Vercel fan-out
// defeats it (see src/lib/rate-limit.ts), so this DB-backed count is
// the real backstop against a compromised admin session spamming
// arbitrary recipients from the verified sending domain. Generous
// enough for any real onboarding burst.
const MAX_INVITE_EMAILS_PER_HOUR = 30;

// Pragmatic email shape check — a full RFC 5322 validator buys nothing
// here (Resend rejects genuinely undeliverable addresses). We only
// guard against obviously malformed input and overlong values.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// True when the account has already created its hourly quota of
// email-bearing invites (the just-inserted row is counted). Fails
// open on a query error — the cap is abuse hardening, not correctness,
// and must never block a legitimate invite.
async function overHourlyEmailCap(
  supabase: SupabaseClient,
  accountId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("account_invitations")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .not("email", "is", null)
    .gt("created_at", since);
  if (error) {
    console.error("[POST /api/account/invitations] cap check failed:", error);
    return false;
  }
  return (count ?? 0) > MAX_INVITE_EMAILS_PER_HOUR;
}

export async function GET() {
  try {
    const ctx = await requireRole("admin");

    const { data, error } = await ctx.supabase
      .from("account_invitations")
      .select(
        "id, role, label, email, email_sent_at, created_by_user_id, created_at, expires_at, accepted_at, accepted_by_user_id",
      )
      .eq("account_id", ctx.accountId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/account/invitations] fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load invitations" },
        { status: 500 },
      );
    }

    return NextResponse.json({ invitations: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");

    // 30/min per user. The Members tab is a clicks-only UI so any
    // legitimate admin is far below this; the cap exists to keep
    // a script run in a loop or a compromised admin session from
    // flooding `account_invitations` with rows.
    const limit = checkRateLimit(
      `admin:inviteCreate:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | { role?: unknown; expiresInDays?: unknown; label?: unknown; email?: unknown }
      | null;

    const role = body?.role;
    if (!isAccountRole(role) || role === "owner") {
      // The DB CHECK already rejects 'owner', but failing fast
      // here gives a clearer 400 than the eventual constraint
      // violation surfaced as a 500.
      return NextResponse.json(
        { error: "'role' must be one of admin, agent, viewer" },
        { status: 400 },
      );
    }

    const expiresInDaysRaw = body?.expiresInDays;
    // `clampExpiryDays` tolerates undefined / NaN / negatives by
    // collapsing to the safe default, so we just pass the raw
    // value through after a type narrow.
    const expiresInDays =
      typeof expiresInDaysRaw === "number" ? expiresInDaysRaw : undefined;
    const expiryDays = clampExpiryDays(expiresInDays);
    const expiresAt = inviteExpiresAt(expiryDays);

    let label: string | null = null;
    if (typeof body?.label === "string") {
      const trimmed = body.label.trim();
      if (trimmed.length > MAX_LABEL_LEN) {
        return NextResponse.json(
          { error: `Label must be ${MAX_LABEL_LEN} characters or fewer` },
          { status: 400 },
        );
      }
      label = trimmed === "" ? null : trimmed;
    }

    // Optional recipient email. When present we both store it (for the
    // pending list) and send the invite through Resend after the row is
    // created. When absent the invite stays link-only.
    let email: string | null = null;
    if (typeof body?.email === "string" && body.email.trim() !== "") {
      const trimmed = body.email.trim().toLowerCase();
      if (trimmed.length > MAX_EMAIL_LEN || !EMAIL_RE.test(trimmed)) {
        return NextResponse.json(
          { error: "Enter a valid email address" },
          { status: 400 },
        );
      }
      email = trimmed;
    }

    // Resolve the base URL BEFORE inserting the row — if we can't
    // publish a usable link there's no point creating an invitation
    // the admin can never share.
    const baseUrl = getBaseUrl(request);
    if (!baseUrl) {
      return NextResponse.json(
        {
          error:
            "Could not determine this deployment's public URL for the invite link. Set NEXT_PUBLIC_SITE_URL.",
        },
        { status: 500 },
      );
    }

    const { token, hash } = generateInviteToken();

    const { data, error } = await ctx.supabase
      .from("account_invitations")
      .insert({
        account_id: ctx.accountId,
        token_hash: hash,
        role,
        created_by_user_id: ctx.userId,
        label,
        email,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, role, label, email, email_sent_at, expires_at, created_at")
      .single();

    if (error || !data) {
      console.error("[POST /api/account/invitations] insert error:", error);
      return NextResponse.json(
        { error: "Failed to create invitation" },
        { status: 500 },
      );
    }

    const url = inviteUrl(token, baseUrl);

    // Send the invite email if the admin supplied an address. A delivery
    // failure must NOT fail the request — the row and link are already
    // valid, so we report emailSent so the UI can fall back to the
    // copy-link flow rather than leaving the admin thinking nothing
    // happened.
    let emailSent = false;
    let emailError: string | null = null;
    if (email) {
      if (!isEmailConfigured()) {
        emailError =
          "Email delivery isn't configured on this deployment — copy the link below to share it.";
      } else if (await overHourlyEmailCap(ctx.supabase, ctx.accountId)) {
        emailError =
          "Hourly invite-email limit reached — copy the link below to share it, or try again later.";
      } else {
        try {
          const message = buildInviteEmail({
            accountName: ctx.account.name,
            role,
            inviteUrl: url,
            expiresInDays: expiryDays,
          });
          await sendEmail({ to: email, ...message });
          emailSent = true;
          // Persist delivery so the pending-list "Emailed" badge
          // reflects a real send, not just the stored intent. A
          // failure here only downgrades the badge, never the invite.
          const { error: stampErr } = await ctx.supabase
            .from("account_invitations")
            .update({ email_sent_at: new Date().toISOString() })
            .eq("id", data.id);
          if (stampErr) {
            console.error(
              "[POST /api/account/invitations] email_sent_at stamp failed:",
              stampErr,
            );
          }
        } catch (err) {
          emailError =
            err instanceof Error ? err.message : "Failed to send the invite email";
          console.error(
            "[POST /api/account/invitations] email send failed:",
            emailError,
          );
        }
      }
    }

    return NextResponse.json(
      {
        invitation: data,
        // Plaintext payload — visible to the admin exactly once.
        token,
        url,
        expiresInDays: expiryDays,
        email,
        emailSent,
        emailError,
      },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
