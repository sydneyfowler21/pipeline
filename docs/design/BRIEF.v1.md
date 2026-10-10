# pipeline — Design brief v1

Designer: Dani · Oct 9, 2026 · Sources: `SPEC.md` and `docs/plans/slice-1.md` on `main` (read via GitHub). The repo wins: if this brief and SPEC disagree, SPEC is right and this file gets fixed.
Mocks: `mocks/*.html` (Tailwind CDN + lucide, self-contained) → `png/*-desktop.png` (1440) and `png/*-mobile.png` (390), rendered by `render.mjs` (headless Playwright, system Chrome). Regenerate: `npm i && python3 gen.py && node render.mjs`.
Pink numbered pins in the mocks are annotations only; they never ship.

## 1. Product summary (from SPEC)
A public portfolio app: a stranger signs in (or taps **Try the demo**), adds a job application, moves it through stages and sees how long each stage lasted. History is **append-only** — there is no status column; the current stage is the latest stage event. Audience: a hiring manager skimming a GitHub pin, so the first 10 seconds (README hero → landing → demo) must look professional and current.

Locked facts the design follows:
- Stages are a fixed enum: **Applied, Screen, Interview, Offer, Closed**. Any stage → any other (revisits; Closed can reopen). Same stage → 409 "Already in this stage".
- Creating an application writes an Applied event at applied_on 12:00 local. `applied_on` is required, not in the future, and **not editable** after creation.
- Stage move: optional `occurred_at` (default now), not in the future, not earlier than the latest event (equal OK). Optional event note.
- Days in stage = local-date difference; the current visit counts to today. Revisits shown per visit **plus** per-stage totals.
- List sorted by last activity = greatest(latest event, updated_at) desc; shows company, role, stage badge, days in current stage, last activity.
- Fields: company and role 1–120 chars; url http/https only; notes ≤ 5,000.
- Every list/save has empty, loading, error; save failures keep input; WCAG AA; no-results message; clean at 390/768/1280.
- Auth: password 12–128 + HIBP; email verification (unverified can sign in but can't create applications); reset link single use, 30 min, revokes all sessions; sessions list + "Sign out of all devices"; no user enumeration; audit log (last 50) in Settings; lockout 5 failures → 1 min doubling to 1 h.
- Demo: verified throwaway user, fictional seed data (Acme Robotics, Northwind Labs, Globex, Initech, Hooli), expires after 24 h, can't change email or password.
- Slice 1 only: 2FA and GitHub sign-in are **slice 2** (reserved slot only). Out of scope: contacts, files, reminders, tags, salary, sharing, etc.

## 2. Information architecture and navigation
Public routes: `/` (landing = sign in, with Try the demo), `/signup`, `/verify` (check inbox + token landing), `/forgot`, `/reset?token=`.
Signed-in routes: `/applications` (list, home), `/applications/new`, `/applications/:id`, `/applications/:id/edit`, `/security`.
- Desktop (≥768): top bar — wordmark, **Applications**, **Security**, account menu (email; Sign out). Content max-width 1200, gutters 32.
- Mobile (<768): top bar (wordmark + account menu) + a two-tab underline nav (Applications / Security) under it. No bottom tab bar — only two destinations.
- Demo banner (warn tint) above the top bar for `is_demo` users: time left, "Email and password can't be changed", link "Create your own account".
- Unverified banner (same slot): "Confirm your email to add applications · Resend link".
- Move to stage is a dialog (≥640) / bottom sheet (<640) on the detail page, not a route. Delete is a confirm dialog from the detail ⋯ menu.
- "Settings" in SPEC = the **Security** page in slice 1 (sessions, 2FA slot, password note, sign-in history). See open question 3.

## 3. Design system (distinct identity; Tailwind + shadcn/ui)
Identity: warm off-white canvas, near-black ink, a single **iris** accent; Geist + Geist Mono (numbers use tabular figures). Top-bar layout, monogram tiles for companies, dashed/hatched treatment for Closed. Nothing is shared with any other project.

### 3.1 Color tokens (light). Exposed as CSS variables → shadcn `--background`, `--foreground`, `--primary`, `--ring`, etc., so dark mode is a second variable set (`.dark`), not new classes.
| Token | Light | shadcn mapping | Use |
|---|---|---|---|
| --canvas | #F7F7F5 | background | page |
| --surface | #FFFFFF | card, popover | cards, inputs, dialogs |
| --subtle | #EFEFEB | muted, secondary | table header, disabled fill, skeleton |
| --hover | #F2F1FC | accent | row/menu hover fill (always paired with an edge) |
| --border | #DAD9D3 | border | **decorative** dividers only (1.41:1) |
| --edge | #85837A | input | input borders, secondary-button borders, hover edges (3.80:1 on white) |
| --ink | #17171C | foreground | text, toast background |
| --muted | #5A5952 | muted-foreground | secondary text |
| --faint | #6E6D66 | — | placeholders only (5.20:1) |
| --accent | #4F3CC9 | primary, ring | primary button, links, focus ring |
| --accent-hover / --accent-pressed | #3F2EB0 / #33248F | — | primary hover / pressed |
| --accent-tint | #EEEBFC | — | selected option, pressed row |
| --danger / --danger-tint | #B42318 / #FDECEA | destructive | errors, destructive |
| --success / --success-tint | #1E7A46 / #E7F5EC | — | confirmations |
| --warn / --warn-tint | #8A5A00 / #FDF3DC | — | demo/unverified banner |
Dark-ready proposal (not designed in slice 1): canvas #111114, surface #18181C, ink #EDEDEA, muted #A8A69E, edge #77756D, accent #9D8FFF; must be re-measured before shipping.

### 3.2 Stage chips (never color alone)
Each stage = **icon + label + color**, and Closed adds a **dashed border** (hatched bar in charts). Icons (lucide): Applied `send`, Screen `phone`, Interview `users`, Offer `badge-check`, Closed `archive`. Chip: 24px tall, 12.5px/550, pill; fill + text + 1px border at 33% of the dot color.
| Stage | Fill | Text | Dot/bar |
|---|---|---|---|
| Applied | #F0F1F5 | #3A4256 | #5B647A |
| Screen | #E6F1FB | #0B4F80 | #1C6FB0 |
| Interview | #FBEFE2 | #7A3E06 | #B4610F |
| Offer | #E5F5EC | #14603A | #1F8A53 |
| Closed | #F3F2F0 | #55534D | #8C8A83 (dashed) |
Timeline nodes use the dot color with a white icon; the current visit node gets a 4px tint ring plus a black "Current" tag. Filter chips use dot + name + count.

### 3.3 Type scale (Geist; numbers `tabular-nums`)
| Role | Size/line | Weight |
|---|---|---|
| Display (landing) | 28/34 · 34/40 on the dark panel | 600, -0.01em |
| H1 page | 30/36 desktop · 26/32 mobile | 600 |
| H2 card | 17/24 | 600 |
| Body | 15/22 (inputs 15; ≥16 on iOS via `text-base` at <640 to avoid zoom) | 400 |
| Small | 13.5/20 | 400 |
| Caption/label | 12–12.5/16, table headers uppercase +0.06em | 500 |
Mobile inputs: use 16px font below 640px (the mocks show 15; build should use 16).

### 3.4 Spacing, radius, elevation
- Spacing on a 4px grid: 4, 8, 12, 16, 20, 24, 32, 40. Card padding 24 (20 mobile). Section gap 24. Page gutter 32 / 16.
- Radius: control 8 (`rounded-lg`), card 12 (`rounded-xl`), dialog 16, sheet top 16, chips/avatars full.
- Elevation: e1 cards `0 1px 2px rgba(23,23,28,.06)`, e2 menus/toasts `0 4px 12px -2px rgba(23,23,28,.10)`, e3 dialogs `0 24px 48px -12px rgba(23,23,28,.28)`; scrim rgba(23,23,28,.45).

### 3.5 Components (shadcn) and states
Button (primary / secondary / ghost / destructive-outline), Input, Textarea with counter, Date picker (Popover + Calendar with disabled ranges), RadioGroup cards (stage picker), Dialog / Sheet, AlertDialog (delete, sign out everywhere), DropdownMenu (⋯, account), Badge (stage chip, "Visit 2", "Current", "Coming in slice 2", "This device"), Table/cards list, Skeleton, Alert (inline), Sonner toast, Tabs-like nav. States for each are in `png/14-states-*.png` and §7.

## 4. Per-screen specs (see annotations in each PNG)
1. **Landing / sign in** (`01`): Try the demo is the primary, full-width button first in the card, with "No sign-up. Sample data, deleted after 24 hours." Sign in is secondary. Right dark panel (≥1024) shows a real stage strip; hidden on mobile so the demo CTA is above the fold. Wrong credentials / unknown email → one message. Lockout shows remaining time.
2. **Sign up** (`02`): email, password (rule shown up front), confirm. Validation on blur/submit. Breach message from server. Always continues to "check your email".
3. **Verify email** (`03`): neutral copy, resend with countdown reason, success and expired-link states, and the in-app unverified banner + disabled Add with reason.
4. **Forgot / reset** (`04`, `05`): generic confirmation; reset warns before saving that every session ends; invalid/expired token replaces the form.
5. **Application list** (`06`) + **empty/no results** (`07`) + **loading** (`08`) + **error** (`09`): ≥768 table (company+role, stage, in stage, last activity "Moved to X · date" or "Notes edited · date"), <768 cards. Row is one link. Search + stage filter (client-side; question 1).
6. **Add / edit** (`10`): two-column on desktop (company, role), single column on mobile; error summary + inline errors; Applied on read-only in edit with reason; save failure keeps input; success toast → detail.
7. **Detail** (`11`): header (monogram, company, role, Move to stage primary, Edit, ⋯), meta row (chip, days in stage, applied date, job posting link), Stage history (newest first, "Visit 2" tags, entered date, days, event note), Time per stage (totals across visits, bars, visit counts), Notes.
8. **Move stage** (`12`): radio cards with icons; current stage disabled with label; "Revisit" hints; optional date (picker limited to [latest event date, today]); optional note; button names the target ("Move to Closed").
9. **Security** (`13`): active sessions (device, approx. location, IP, last seen, "This device"), Sign out everywhere with confirm, 2FA reserved card "Coming in slice 2" with disabled Set up 2FA + reason, password card (demo: can't change; real: reset by email), sign-in history table (last 50).
10. **README hero** (`15-readme-hero.png`, 1600×900, light): browser frame showing the Acme Robotics detail (revisits + totals are the story) with a phone frame showing the list, on a soft warm canvas. Crop: browser 1180×760 at (80,64); phone 340×690 right. Demo data = fixture user A plus Initech/Hooli from the demo seed. No pins, no demo banner, URL bar reads the live demo host. GitHub renders it at ~880px wide: all key text is ≥12px after scaling. Capture from the real app at 1440×900 with `?screenshot` hiding the demo banner, then compose (or ship this composition script).

## 5. Interaction checklist (applies to every screen from day one; review on the live preview, not stills)
Method: for each component type, check every row at 390, 768 and 1280. A row fails if any state is missing.
| # | Check | Target |
|---|---|---|
| I1 | Hover | Never fill-only. Buttons: darker fill (primary) or fill + edge darkens to ink (secondary); ghost: fill + underline; rows/menu items: tint + 3px inset accent edge + underline of the title; links: underline thickens. Edge contrast ≥3:1 against its background (accent edge 7.44:1 on white). |
| I2 | Pressed (`:active`) | Distinct from hover: primary #33248F (11.73:1 text), secondary/rows accent-tint + accent-pressed edge. |
| I3 | Focus-visible | 2px #4F3CC9 outline, 2px offset, on every interactive element, never removed (7.44:1 on white, 6.94:1 on canvas). Focus returns to the trigger when dialogs/sheets/menus close. |
| I4 | Cursor | `pointer` on every clickable incl. rows, chips, cards; `not-allowed` on disabled; text on inputs. |
| I5 | Disabled | Visibly disabled (50% opacity or subtle fill) **and** a visible reason (helper text or label): current stage, resend countdown, 2FA "Not available yet", applied_on locked, unverified Add, lockout. |
| I6 | Hit area | ≥44×44px for all controls on all widths (buttons h-11, icon buttons 44 square, rows ≥68, radio cards ≥48, links padded to 44 min-height where standalone). |
| I7 | Empty | Every list: list empty, no results (search/filter), sessions (never empty — current device), history empty ("No security events yet"). |
| I8 | Loading | Skeleton with real geometry after 150ms; buttons show spinner + verb ("Saving…", "Moving…", "Setting up your demo…") and are disabled; aria-busy. |
| I9 | Error | Inline alert with plain cause + action; field errors with icon + text + aria-describedby; input kept on failure; no raw server text. |
| I10 | Success | Toast for create/edit/move/delete; inline success for verify/reset-request; focus lands somewhere sensible (detail heading, new timeline row). |
| I11 | Contrast | Text ≥4.5:1, large text and UI parts ≥3:1 incl. hover and pressed states (table in §7). Placeholders ≥4.5:1 (#6E6D66, 5.20:1). |
| I12 | Keyboard path | Skip link → nav → page primary action → content. Rows reachable by Tab, Enter opens. Radio group uses arrows. Esc closes dialog/sheet/menu. No keyboard traps. |
| I13 | Wrap/truncate @390 | Cards; titles truncate with full text in `title`; chips never wrap internally; action rows go full width; filter row scrolls horizontally. |
| I14 | Wrap/truncate @768 | Table shows; company/role truncate; detail is single column; dialog centered 480 max. |
| I15 | Wrap/truncate @1280 | Two-column detail and security; content max 1200; no line longer than ~80ch. |
| I16 | Motion | Respect prefers-reduced-motion (no shimmer, no sheet slide). |
| I17 | Time | All dates/times shown in the user's time zone; Security page states the zone. |

## 6. Copy / terminology
| Use | Not | Notes |
|---|---|---|
| Application | job, opportunity | Company + role |
| Stage | status | No status column; history is the source |
| Applied, Screen, Interview, Offer, Closed | Rejected, Withdrawn, Ghosted | Fixed enum; reason goes in the event note |
| Move to stage / Move to {Stage} | Change status, Update | Dialog button names the target |
| Stage history | log, activity | Timeline on detail |
| Visit 2 / Revisit | repeat, loop | A stage entered again |
| Time per stage | duration summary | Totals across visits |
| N days / N days so far / Today | "d", "1 days" | Singular "1 day" |
| Last activity | updated | "Moved to X · Oct 6" or "Notes edited · Oct 8" |
| Notes (application) / Note (stage change) | comments | "Running summary" vs "What changed" |
| Try the demo | Guest mode | Primary CTA |
| Sign out everywhere | Sign out of all devices | Confirm names the device count (SPEC wording is the API action name) |
| Sign-in history | audit log | User-facing name for auth_events |
| Email or password is incorrect. | — | SPEC, exact |
| If that email can be used, we've sent a link. | — | SPEC, exact |
| Already in this stage | — | SPEC 409; normally prevented by the disabled option |
| Can't be in the future. / Can't be before the last change ({date}). | — | 422 mappings |
| Coming in slice 2 | Coming soon | 2FA slot |

## 7. Measured contrast (WCAG 2.x, computed by `contrast.py`)
| Foreground | Background | Ratio |
|---|---|---|
| ink #17171C | surface #FFFFFF | 17.86:1 |
| ink #17171C | canvas #F7F7F5 | 16.65:1 |
| ink #17171C | subtle #EFEFEB | 15.49:1 |
| ink #17171C | hover #F2F1FC | 15.96:1 |
| muted #5A5952 | surface #FFFFFF | 7.03:1 |
| muted #5A5952 | canvas #F7F7F5 | 6.56:1 |
| muted #5A5952 | subtle #EFEFEB | 6.10:1 |
| muted #5A5952 | hover #F2F1FC | 6.28:1 |
| faint #6E6D66 | surface #FFFFFF | 5.20:1 |
| onAccent #FFFFFF | accent #4F3CC9 | 7.44:1 |
| onAccent #FFFFFF | accentH #3F2EB0 | 9.42:1 |
| onAccent #FFFFFF | accentP #33248F | 11.73:1 |
| accent #4F3CC9 | surface #FFFFFF | 7.44:1 |
| accent #4F3CC9 | accentTint #EEEBFC | 6.35:1 |
| accentH #3F2EB0 | hover #F2F1FC | 8.42:1 |
| edge #85837A | surface #FFFFFF | 3.80:1 |
| edge #85837A | canvas #F7F7F5 | 3.54:1 |
| edge #85837A | subtle #EFEFEB | 3.30:1 |
| edge #85837A | hover #F2F1FC | 3.40:1 |
| border #DAD9D3 | surface #FFFFFF | 1.41:1 |
| focus #4F3CC9 | surface #FFFFFF | 7.44:1 |
| focus #4F3CC9 | canvas #F7F7F5 | 6.94:1 |
| danger #B42318 | surface #FFFFFF | 6.57:1 |
| danger #B42318 | dangerTint #FDECEA | 5.75:1 |
| success #1E7A46 | successTint #E7F5EC | 4.75:1 |
| success #1E7A46 | surface #FFFFFF | 5.35:1 |
| warn #8A5A00 | warnTint #FDF3DC | 5.37:1 |

Stage chips:
| Stage | Text on fill | Dot/border |
|---|---|---|
| Applied | text #3A4256 on #F0F1F5 8.89:1 | border/dot #5B647A on #F0F1F5 5.24:1, on white 5.92:1 |
| Screen | text #0B4F80 on #E6F1FB 7.50:1 | border/dot #1C6FB0 on #E6F1FB 4.64:1, on white 5.32:1 |
| Interview | text #7A3E06 on #FBEFE2 7.36:1 | border/dot #B4610F on #FBEFE2 3.98:1, on white 4.51:1 |
| Offer | text #14603A on #E5F5EC 6.73:1 | border/dot #1F8A53 on #E5F5EC 3.86:1, on white 4.36:1 |
| Closed | text #55534D on #F3F2F0 6.87:1 | border/dot #8C8A83 on #F3F2F0 3.09:1, on white 3.45:1 |
`--border` (1.41:1) is decorative only; anything a user must perceive as a control boundary uses `--edge`. Disabled controls are exempt from contrast but always carry a reason text that passes 4.5:1.

## 8. API / data needs implied by the screens (beyond SPEC)
1. **List payload** per application: `currentStage`, `daysInCurrentStage` (or events so the client runs `computeTimeline`), `lastActivityAt` and `lastActivityKind` (`stage_change` + stage | `edited`) for "Moved to Interview · Oct 6" / "Notes edited · Oct 8".
2. **Detail payload**: events + server- or client-computed `visits[]` (stage, enteredLocal, days, current, visitNumber per stage) and `totals` with visit counts; `latestEventLocalDate` to bound the date picker; user `timeZone` and `today`.
3. **Stage filter counts** for the chips (derivable client-side from the list; no endpoint needed if the list is unpaginated).
4. **Sessions endpoint**: id (opaque, not the token hash), parsed device/browser from user_agent, ip, created_at, last_seen_at, `isCurrent`. Optional coarse location (needs IP geolocation — not in SPEC).
5. **Auth events endpoint** (last 50): kind → display label, parsed device, ip, created_at.
6. **Me endpoint**: email, `emailVerified`, `isDemo`, `demoExpiresAt` (banner countdown), `timeZone`.
7. **Error shapes**: lockout response with `retryAfterSeconds`; resend-verification with `retryAfterSeconds`; field-keyed zod errors (`{field, message}`) for 422 so inline errors map to fields.
8. **Try the demo**: POST that returns once the user is seeded and signed in (button shows progress until then).

## 9. Open questions for Tech Lead
1. Search + stage filter on the list aren't in SPEC, but SPEC requires a "no-results message", which implies one. OK to add client-side search + stage filter chips? If not, I drop both and the no-results state goes too.
2. Stage-event note length limit? SPEC caps application notes at 5,000 but not event notes. I propose 280.
3. SPEC says "Session list shown in Settings" and "last 50 in Settings". I named the page **Security** (no other settings exist in slice 1). OK, or call it Settings › Security?
4. Should signed-in non-demo users get a **change password** form? SPEC only has reset by email; I show "Reset it by email" for now.
5. Session location ("Denver, US") needs IP geolocation, not in SPEC. Add (e.g. offline GeoLite DB) or show IP only?
6. Per-session "Sign out" (revoke one device) isn't in SPEC; I only show Sign out everywhere. Want it?
7. Should the README hero be captured from the real app (Playwright script in repo, regenerated per release) or composed once from these mocks? I recommend a script so it never goes stale.
8. Time zone: users default to America/Denver and there's no UI to change it. Add a time-zone select on Security (or auto-detect on sign-up)? A hiring manager in Berlin would see Denver dates.
9. Demo banner "Create your own account" — should it sign the demo user out first, or open sign-up in place?

## 10. Files
- `BRIEF.md` (this file), `contrast.py`, `gen.py` (mock generator), `render.mjs` (Playwright renderer)
- `mocks/01-signin.html` … `mocks/15-readme-hero.html`
- `png/NN-*-desktop.png` (1440 wide, full page) and `png/NN-*-mobile.png` (390 wide) for 01–14; `png/15-readme-hero.png` (1600×900)
