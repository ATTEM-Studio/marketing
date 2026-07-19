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
});
