import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";
import { corsHeaders, json, normalizeEmail } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST")
    return json(405, { error: "method_not_allowed" });

  let body: { confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "confirmation_required" });
  }
  // Task 7 must call this only after a user-visible confirmation. Auth callbacks
  // must not send this flag or finalize registration automatically.
  if (body.confirm !== true) {
    return json(400, { error: "confirmation_required" });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json(401, { error: "unauthorized" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) {
    return json(500, { error: "registration_unavailable" });
  }

  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { authorization } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData.user;
  if (userError || !user?.email) return json(401, { error: "unauthorized" });

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: finalizeError } = await adminClient.rpc(
    "finalize_buyer_registration",
    {
      p_user_id: user.id,
      p_email: normalizeEmail(user.email),
    },
  );
  if (finalizeError) return json(403, { error: "registration_forbidden" });

  return json(200, { active: true });
});
