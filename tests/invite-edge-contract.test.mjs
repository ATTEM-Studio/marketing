import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const redeemInvite = readFileSync(
  resolve(process.cwd(), "supabase/functions/redeem-invite/index.ts"),
  "utf8",
);
const finalizeRegistration = readFileSync(
  resolve(process.cwd(), "supabase/functions/finalize-registration/index.ts"),
  "utf8",
);
const http = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/http.ts"),
  "utf8",
);
const config = readFileSync(
  resolve(process.cwd(), "supabase/config.toml"),
  "utf8",
);

describe("invite edge security contract", () => {
  test("fails closed when the deployment-guaranteed client IP header is absent", () => {
    expect(redeemInvite).toContain('request.headers.get("cf-connecting-ip")');
    expect(redeemInvite).toContain(
      'if (!ip) return json(400, { error: "client_ip_required" });',
    );
    expect(redeemInvite).not.toContain("x-forwarded-for");
    expect(redeemInvite).not.toContain("fly-client-ip");
    expect(redeemInvite).not.toContain('"unknown"');
  });

  test("requires an explicit confirmation and cannot be auto-finalized by a callback", () => {
    expect(finalizeRegistration).toContain("body.confirm !== true");
    expect(finalizeRegistration).toContain(
      "must not send this flag or finalize registration automatically",
    );
  });

  test("allows the Supabase SDK browser preflight headers", () => {
    for (const header of [
      "x-supabase-client-platform",
      "x-supabase-client-platform-version",
      "x-supabase-client-runtime",
      "x-supabase-client-runtime-version",
    ]) {
      expect(http).toContain(header);
    }
  });

  test("tries a reusable normalized hash before the peppered single-use hash", () => {
    expect(redeemInvite).toContain("await sha256(inviteCode)");
    expect(redeemInvite).toContain("await sha256(`${pepper}${inviteCode}`)");
    expect(redeemInvite).toContain("for (const codeHash of candidateHashes)");
  });

  test("requires an authenticated anonymous user before activating access", () => {
    expect(redeemInvite).toContain('request.headers.get("authorization")');
    expect(redeemInvite).toContain("auth.getUser(token)");
    expect(redeemInvite).toContain("user.is_anonymous !== true");
    expect(redeemInvite).toContain('"activate_anonymous_reader"');
  });

  test("activates immediately without sending an email OTP", () => {
    expect(redeemInvite).not.toContain("signInWithOtp");
    expect(redeemInvite).toContain("return json(200, { active: true })");
  });

  test("enables anonymous auth and delegates modern JWT validation to the function", () => {
    expect(config).toContain("enable_anonymous_sign_ins = true");
    expect(config).toMatch(/\[functions\.redeem-invite\]\s+verify_jwt = false/);
  });
});
