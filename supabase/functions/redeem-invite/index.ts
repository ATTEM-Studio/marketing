import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";
import { corsHeaders, json, normalizeEmail, sha256 } from "../_shared/http.ts";

const invalidInvite = () =>
  json(400, {
    error: "코드를 확인할 수 없습니다. 입력 내용을 다시 확인해 주세요.",
  });

type RegistrationInput = {
  name?: unknown;
  email?: unknown;
  region?: unknown;
  businessName?: unknown;
  inviteCode?: unknown;
  requiredConsent?: unknown;
  marketingConsent?: unknown;
};

function text(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximum
    ? normalized
    : null;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST")
    return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const pepper = Deno.env.get("INVITE_HASH_PEPPER");
  const siteUrl = Deno.env.get("SITE_URL");
  if (!url || !anonKey || !serviceRoleKey || !pepper || !siteUrl) {
    return json(500, { error: "registration_unavailable" });
  }

  const authClient = createClient(url, anonKey);
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const ipHash = await sha256(`${pepper}:${clientIp(request)}`);
  const { error: attemptError } = await adminClient
    .from("invite_attempts")
    .insert({ ip_hash: ipHash });
  if (attemptError) return json(500, { error: "registration_unavailable" });

  const { count, error: countError } = await adminClient
    .from("invite_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("attempted_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
  if (countError) return json(500, { error: "registration_unavailable" });
  if ((count ?? 0) > 5) return json(429, { error: "too_many_requests" });

  let body: RegistrationInput;
  try {
    body = await request.json();
  } catch {
    return invalidInvite();
  }

  const name = text(body.name, 100);
  const region = text(body.region, 100);
  const businessName = text(body.businessName, 160);
  const inviteCode = text(body.inviteCode, 200)?.toUpperCase();
  const email =
    typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const emailIsValid =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
  if (
    !name ||
    !region ||
    !businessName ||
    !inviteCode ||
    !emailIsValid ||
    body.requiredConsent !== true ||
    typeof body.marketingConsent !== "boolean"
  ) {
    return invalidInvite();
  }

  const codeHash = await sha256(`${pepper}${inviteCode}`);
  const { data: invite, error: inviteError } = await adminClient
    .from("invite_codes")
    .select("id, status, reserved_email, expires_at")
    .eq("code_hash", codeHash)
    .maybeSingle();
  if (
    inviteError ||
    !invite ||
    invite.status !== "available" ||
    new Date(invite.expires_at).getTime() <= Date.now()
  ) {
    return invalidInvite();
  }

  const { data: reservedInvite, error: reserveError } = await adminClient
    .from("invite_codes")
    .update({
      status: "reserved",
      reserved_email: email,
      reserved_at: new Date().toISOString(),
    })
    .eq("id", invite.id)
    .eq("status", "available")
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (reserveError || !reservedInvite) return invalidInvite();

  const { error: pendingError } = await adminClient
    .from("pending_registrations")
    .upsert(
      {
        email,
        name,
        region,
        business_name: businessName,
        required_consent: true,
        marketing_consent: body.marketingConsent,
        invite_code_id: invite.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    );
  if (pendingError) return json(500, { error: "registration_unavailable" });

  const { error: otpError } = await authClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/?auth=callback`,
      shouldCreateUser: true,
    },
  });
  if (otpError) return json(500, { error: "registration_unavailable" });

  return json(202, { accepted: true });
});
