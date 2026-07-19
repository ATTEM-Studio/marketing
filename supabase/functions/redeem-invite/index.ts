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
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("fly-client-ip") ??
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
  const { data: attemptAllowed, error: attemptError } = await adminClient.rpc(
    "consume_invite_attempt",
    { p_ip_hash: ipHash },
  );
  if (attemptError) return json(500, { error: "registration_unavailable" });
  if (!attemptAllowed) return json(429, { error: "too_many_requests" });

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
  const { data: reservationAccepted, error: reserveError } =
    await adminClient.rpc("reserve_buyer_registration", {
      p_code_hash: codeHash,
      p_email: email,
      p_name: name,
      p_region: region,
      p_business_name: businessName,
      p_required_consent: true,
      p_marketing_consent: body.marketingConsent,
    });
  if (reserveError || !reservationAccepted) return invalidInvite();

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
