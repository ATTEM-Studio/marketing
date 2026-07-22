# Invite seed and advertising attribution design

## Scope

Correct the operating guide's invite seed contract and separate future advertising projections from actual customer acquisition cost. No new advertising data source, automatic attribution, or partial-result mode is introduced.

## Invite seed contract

The operating guide normalizes the locally entered invite code with JavaScript `trim().toUpperCase()` immediately before hashing. This is the same normalization used by the redeem Edge Function. The guide explains that hashing a lowercase, mixed-case, or whitespace-padded code without normalization creates a hash the Edge Function cannot find.

The seed SQL explicitly inserts `status = 'available'`; it never uses a status outside the database check constraint. A static README contract test locks normalization order, the available status, and the lowercase-code warning.

## Advertising data contract

`AdvertisingInputs` gains `actualAdSpend: number | null`. While ads are not running, all four advertising values are hidden, disabled, cleared, ignored, and persisted as null. While ads are running, the four fields remain optional as a group:

- Visit conversion rate must be greater than 0% and at most 100% when entered.
- Cost per click and actual ad spend must be finite and non-negative when entered.
- Actual ad-attributed new customers must be finite and at least one when entered.
- Invalid entered values produce a field error, `aria-invalid`, and focus on the first invalid field.

Advertising attribution is complete only when all four values are present and valid. Partial valid input is not a form error; it yields `needs_measurement` so the existing recommendation system provides exactly one measurement action.

## Calculations and result copy

In complete attribution mode:

- `requiredClicks = ceil(newCustomerTarget / visitConversionRate)`
- `estimatedAdSpend = requiredClicks * costPerClick`
- `customerAcquisitionCost = actualAdSpend / actualAdNewCustomers`

Required clicks and estimated ad spend are future target projections. CAC is labelled `actual 기준 CAC` and uses only actual spend and actual ad-attributed customers. The assumptions list all four inputs. Reaching the revenue target may make future required clicks and estimated spend zero, but it does not zero an actual CAC.

If any advertising value is absent, the result shows no advertising figures and the existing seven-day acquisition-measurement action appears exactly once.

## Persistence and tests

The full advertising input object, including `actualAdSpend`, remains part of the assessment input JSON and the calculated metrics remain in the assessment metrics JSON.

Regression coverage includes:

- README normalization, state, and lowercase mismatch contract.
- CAC independence from estimated spend.
- Non-zero actual CAC when the target is reached.
- Missing actual spend returns measurement status with no CAC and one action.
- Actual spend boundary and malformed-number UI validation with ARIA/focus.
- Assessment JSON includes actual ad spend.
- Complete UI result labels and assumptions distinguish estimated spend from actual CAC.

## Verification boundary

Run the complete TypeScript suite, typecheck, formatting, security scan, normal build, demo build, and diff checks. Dynamic database tests remain a CI responsibility when Docker and `psql` are unavailable locally.
