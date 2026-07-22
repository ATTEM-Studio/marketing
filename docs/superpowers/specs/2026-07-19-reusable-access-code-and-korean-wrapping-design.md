# Reusable access code and Korean wrapping design

## Goal

Make `DOITNOW` the shared access code printed in the ebook and remove awkward Korean syllable breaks across the responsive site without weakening account or store-data isolation.

## Access-code behavior

- `DOITNOW` is a reusable campaign access code, not a user password or proof of purchase.
- Input is normalized with `trim().toUpperCase()`, so case and surrounding whitespace do not affect validation.
- Any number of readers may use the code while it is active and unexpired.
- Every reader still registers with a distinct email and receives a separate Supabase Auth identity, profile, store, diagnosis, and action history.
- Existing IP-based registration attempt limiting and generic failure messages remain in place.
- The browser sends the entered code to the Supabase Edge Function but never decides whether it is valid.

## Data and server flow

The existing invite-code table gains an explicit reusable mode. Single-use rows keep their reservation and redemption behavior. A reusable row remains available after successful registration and may be referenced by multiple pending registrations, so the current uniqueness constraint on `pending_registrations.invite_code_id` is relaxed.

The registration reservation function handles reusable rows without reserving or redeeming the shared row. It creates or refreshes a pending registration for the normalized email. Finalization validates that the reusable row remains active and unexpired, creates the user profile and store through the existing atomic flow, and leaves the shared row available.

A migration seeds only the normalized hash for `DOITNOW`; the raw value is not stored in the database. The Edge Function continues hashing normalized input on the server. Existing single-use codes remain supported for future campaigns.

## Typography behavior

- Korean headings and prose use `word-break: keep-all` so line breaks occur between words instead of between arbitrary syllables.
- Headings use balanced wrapping where supported; paragraphs use pretty wrapping where supported.
- General text falls back to `overflow-wrap: break-word`, avoiding ordinary word fragmentation while still preventing layout overflow.
- Long machine tokens such as email addresses, URLs, and large numeric strings retain targeted `overflow-wrap: anywhere` rules.
- Buttons, badges, form labels, cards, and progress UI must not create horizontal overflow at 375 px, 768 px, or 1440 px viewport widths.

## Error handling and security

- Invalid access codes return the same generic response as other invalid registration input.
- Rate-limited requests continue returning the existing rate-limit response.
- Reusable access never bypasses email confirmation or row-level security.
- No service-role key or pepper enters the Vite bundle.
- Database migration and Edge Function deployment happen before the Vercel frontend verification.

## Verification

- Database contract tests cover reusable availability, multi-email pending registrations, and non-redemption after finalization.
- Edge contract tests cover normalization and server-side hashing.
- CSS contract tests reject global `overflow-wrap: anywhere` on Korean content and require keep-all, balanced headings, and targeted long-token wrapping.
- The full format, type, unit, security, and production-build suite passes.
- Live browser checks cover the landing and registration screens at 375 px, 768 px, and 1440 px with no horizontal overflow or console errors.
- Two different test emails can submit the same `DOITNOW` access code without consuming it.
