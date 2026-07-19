# Anonymous instant access design

## Goal

Let an ebook reader enter store information, an email address, and the shared `DOITNOW` code, then enter the diagnosis immediately without opening an email or creating a password.

## Identity model

Supabase Anonymous Auth owns the browser session and the database user ID. The submitted email is an unverified lead/contact field, not a login identifier and not proof that the visitor owns that address. A visitor can never access another visitor's profile by typing the same email because RLS continues to use the anonymous Auth user ID.

The anonymous session persists in the same browser. Clearing browser storage or moving to another browser/device creates a new account and cannot recover the prior diagnosis. The registration screen explains this limitation briefly. Duplicate normalized lead emails are allowed because they may represent the same reader using another device; reporting may deduplicate them, but authorization never does.

## Registration flow

1. The visitor enters name, email, region, business name, `DOITNOW`, and consent choices.
2. The browser creates or reuses a Supabase anonymous session.
3. The browser invokes `redeem-invite` with the anonymous bearer token and the registration input.
4. The Edge Function verifies the bearer token belongs to an anonymous user, applies the existing IP rate limit, normalizes the code with `trim().toUpperCase()`, and tries the reusable and legacy single-use hashes.
5. A service-role-only database RPC locks the matching invite row and atomically creates the profile, consent events, and store for that anonymous user. `DOITNOW` remains available. A legacy single-use code is redeemed to the anonymous user.
6. The Edge Function returns only `{ active: true }`. The browser loads the active profile and opens diagnosis immediately.

No email OTP is sent. The confirmation screen and automatic callback finalization are not part of the new-reader path. Existing callback handling may remain temporarily for already-issued legacy links, but the public registration and login surfaces no longer direct new readers into it.

## Database changes

- Remove the unique constraint from `profiles.email`; keep lowercase/trim validation.
- Add a service-role-only `activate_anonymous_reader(...) returns uuid` function.
- The function confirms the supplied Auth user exists and is anonymous, returns the existing store for an already-active user, validates the invite under a row lock, inserts the profile/store/consents atomically, and consumes only non-reusable codes.
- Existing pending-registration and email-confirmation functions remain for migration compatibility, but the new UI does not create pending registrations.
- RLS policies continue authorizing by `auth.uid()` and active profile status.

## UI behavior

- The registration submit button reads `바로 진단 시작하기`.
- While submitting, the status reads `입장 코드를 확인하고 내 공간을 만들고 있어요.`
- On success, the UI opens diagnosis without showing an email confirmation screen.
- The old email-link login form is removed from the primary journey. A signed-out visitor starts again; an active same-browser session is restored automatically on page load.
- The form states: `이 기기에 기록이 저장됩니다. 다른 기기에서는 이전 기록을 불러올 수 없어요.`

## Failure handling

- Invalid code and invalid registration data keep the same generic code error.
- A failed activation signs out a newly created anonymous session so a retry starts cleanly.
- An interrupted anonymous session with no active profile may retry registration; it cannot read or write business data until activation succeeds.
- Rate limiting remains six attempts per rolling 15-minute IP window.
- The service-role key and invite hashes never enter the Vite bundle.

## Operations

- Enable anonymous sign-ins in the linked Supabase Auth configuration before deploying the frontend.
- Keep email confirmations enabled for legacy email-auth accounts; the instant-access path does not call email Auth.
- Deploy the database migration before `redeem-invite`, then deploy Vercel.
- Do not enable CAPTCHA in this iteration because it contradicts the requested no-extra-step entry flow; monitor abuse and add CAPTCHA later if rate limiting is insufficient.

## Verification

- Unit tests prove registration creates/reuses an anonymous session and returns an active app session without `signInWithOtp`.
- Edge contract tests prove a bearer user must be anonymous and no OTP is sent.
- pgTAP tests prove two profiles may share a claimed email while their user/store rows remain separate, `DOITNOW` stays available, and single-use codes are consumed.
- UI tests prove success immediately calls `onAuthenticated` and contains no confirmation-link instructions.
- Full format, type, unit, security, and production build checks pass.
- Live browser verification confirms `DOITNOW` proceeds directly to diagnosis in a controlled browser session, persists after refresh in that browser, and creates no browser errors.
