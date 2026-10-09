# pipeline — Design brief v2

**Approved for slice 1 (Oct 9 2026)** — Tech Lead and Sydney.

**v2 (Oct 9, 2026)** folds in Tech Lead's answers to the 9 v1 questions: list search + stage filter; 280-char stage-change note with counter; the page is **Settings** (Security + Preferences); change password; sessions show device/browser + IP only; per-session Sign out; README hero captured by a Playwright script (§4.10); time zone auto-detected at sign-up and editable in Preferences; demo "Create your own account" signs out first. Mobile inputs are 16px. Dark mode is after slice 1. v1 is kept as `BRIEF.v1.md`.

Designer: Dani · v1 and v2 Oct 9, 2026 · Sources: `SPEC.md` and `docs/plans/slice-1.md` on `main` (read via GitHub). The repo wins: if this brief and SPEC disagree, SPEC is right and this file gets fixed.
Mocks: `mocks/*.html` (Tailwind CDN + lucide, self-contained) → `png/*-desktop.png` (1440) and `png/*-mobile.png` (390), rendered by `render.mjs` (headless Playwright, system Chrome). Regenerate from `scripts/`: `cd scripts && npm i && python3 gen.py && node render.mjs` (needs a local Chrome at /usr/bin/google-chrome or edit `executablePath`).
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
Signed-in routes: `/applications` (list, home; `?q=&stage=`), `/applications/new`, `/applications/:id`, `/applications/:id/edit`, `/settings` → `/settings/security`, `/settings/preferences`.
- Desktop (≥768): top bar — wordmark, **Applications**, **Settings**, account menu (email; Settings; Sign out). Content max-width 1200, gutters 32.
- Mobile (<768): top bar (wordmark + account menu) + a two-tab underline nav (Applications / Settings) under it. No bottom tab bar — only two destinations.
- Demo banner (warn tint) above the top bar for `is_demo` users: time left, "Email and password can't be changed", link "Create your own account". **Flow:** the link signs the demo user out first (normal sign-out, session deleted), then opens `/signup`. No confirm: the banner already says the data is throwaway. The demo user is left for the hourly expiry job.
- Settings has two sections: **Security** (sessions, password, 2FA slot, sign-in history) and **Preferences** (time zone). Desktop: left section nav (200px). Mobile: a two-segment control under the H1.
- Unverified banner (same slot): "Confirm your email to add applications · Resend link".
- Move to stage is a dialog (≥640) / bottom sheet (<640) on the detail page, not a route. Delete is a confirm dialog from the detail ⋯ menu.

## 3. Design system (distinct identity; Tailwind + shadcn/ui)
Identity: warm off-white canvas, near-black ink, a single **iris** accent; Geist + Geist Mono (numbers use tabular figures). Top-bar layout, monogram tiles for companies, dashed/hatched treatment for Closed. Nothing is shared with any other project.

### 3.1 Color tokens (light). Exposed as CSS variables → shadcn `--background`, `--foreground`, `--primary`, `--ring`, etc., so a dark set (`.dark`) can be added after slice 1 without new classes.
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
Dark mode: **after slice 1.** Tokens are CSS variables so a `.dark` set can be added later; no dark palette is proposed or tested now.

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
| Body | 15/22 | 400 |
| Inputs, textareas, comboboxes | 16/24 below 640px (`text-base sm:text-[15px]`) so iOS doesn't zoom; 15 from 640 up | 400 |
| Small | 13.5/20 | 400 |
| Caption/label | 12–12.5/16, table headers uppercase +0.06em | 500 |

### 3.4 Spacing, radius, elevation
- Spacing on a 4px grid: 4, 8, 12, 16, 20, 24, 32, 40. Card padding 24 (20 mobile). Section gap 24. Page gutter 32 / 16.
- Radius: control 8 (`rounded-lg`), card 12 (`rounded-xl`), dialog 16, sheet top 16, chips/avatars full.
- Elevation: e1 cards `0 1px 2px rgba(23,23,28,.06)`, e2 menus/toasts `0 4px 12px -2px rgba(23,23,28,.10)`, e3 dialogs `0 24px 48px -12px rgba(23,23,28,.28)`; scrim rgba(23,23,28,.45).

### 3.5 Components (shadcn) and states
Button (primary / secondary / ghost / destructive-outline), Input, Textarea with counter, Date picker (Popover + Calendar with disabled ranges), RadioGroup cards (stage picker), Dialog / Sheet, AlertDialog (delete, sign out everywhere), DropdownMenu (⋯, account), Badge (stage chip, "Visit 2", "Current", "Coming in slice 2", "This device"), Table/cards list, Skeleton, Alert (inline), Sonner toast, Tabs-like nav, segmented control (Settings sections on mobile), Combobox (Command + Popover; Sheet on mobile) for time zone, search Input with clear button, filter chip toggle group. States for each are in `png/14-states-*.png` and §7.

## 4. Per-screen specs (see annotations in each PNG)
1. **Landing / sign in** (`01`): Try the demo is the primary, full-width button first in the card, with "No sign-up. Sample data, deleted after 24 hours." Sign in is secondary. Right dark panel (≥1024) shows a real stage strip; hidden on mobile so the demo CTA is above the fold. Wrong credentials / unknown email → one message. Lockout shows remaining time.
2. **Sign up** (`02`): email, password (rule shown up front), confirm. Validation on blur/submit. Breach message from server. Always continues to "check your email".
3. **Verify email** (`03`): neutral copy, resend with countdown reason, success and expired-link states, and the in-app unverified banner + disabled Add with reason.
4. **Forgot / reset** (`04`, `05`): generic confirmation; reset warns before saving that every session ends; invalid/expired token replaces the form.
5. **Application list** (`06`) + **empty** (`07`) + **loading** (`08`) + **error** (`09`) + **no results** (`16`): ≥768 table (company+role, stage, in stage, last activity "Moved to X · date" or "Notes edited · date"), <768 cards. Row is one link.
   - **Search** (company or role, case-insensitive, debounced 200ms, ✕ clear button 44px, Esc clears) and **stage filter** chips (single-select: All + 5 stages, each with dot + name + count for the current search). Both in the URL (`?q=&stage=`). Desktop: search 320px left, chips right; mobile: full-width search, chips scroll horizontally with the active chip scrolled into view.
   - **No results** (`16`) is only reachable through search/filter: "No applications match “{q}” in {Stage}" (or without either part), with **Show all stages** and **Clear search and filter**. Empty (`07`) hides search and filter.
6. **Add / edit** (`10`): two-column on desktop (company, role), single column on mobile; error summary + inline errors; Applied on read-only in edit with reason; save failure keeps input; success toast → detail.
7. **Detail** (`11`): header (monogram, company, role, Move to stage primary, Edit, ⋯), meta row (chip, days in stage, applied date, job posting link), Stage history (newest first, "Visit 2" tags, entered date, days, event note), Time per stage (totals across visits, bars, visit counts), Notes.
8. **Move stage** (`12`): radio cards with icons; current stage disabled with label; "Revisit" hints; optional date (picker limited to [latest event date, today]); optional note (textarea, max **280**, live counter "20 / 280"; warn at 260+, danger + "N characters over" + Move disabled past 280); button names the target ("Move to Closed").
9. **Settings › Security** (`13`, demo variant `13b`):
   - **Active sessions:** device/browser (parsed user agent) + IP + last seen, no location. "This device" badge on the current session, which has no button and says "Sign out here from the account menu". Every other session has its own **Sign out** (secondary; hover/pressed turn danger tint + danger border + danger text). No confirm; spinner, then the row leaves; toast "Signed out {device}."; focus moves to the next row's button. **Sign out everywhere** stays (destructive outline + confirm).
   - **Password:** current, new, confirm. Before saving: "Changing your password signs out your other N devices. You stay signed in here." Errors: "Current password is incorrect." plus the sign-up rules. Success rotates this session, clears fields, refreshes sessions, toast "Password changed. Your other devices were signed out." **Demo:** the form is disabled, with a warn alert "Demo accounts can't change their password. Create your own account to use this."
   - **2FA** slot "Coming in slice 2" (unchanged) and **Sign-in history** (last 50, in the user's time zone; adds "Signed out a device" and "Password changed" events).
10. **Settings › Preferences** (`17`): Time zone combobox (searchable IANA list with current UTC offsets), hint "Your browser reports X. Use browser time zone" (only when different), note that changing it re-counts days but doesn't change history, Save disabled until changed ("No changes to save"), inline success "Saved. Dates now use X." Demo users can change it.
   **Sign-up** (`02`) shows "Time zone: America/Denver, from your browser. You can change it in Settings." The browser value is sent with sign-up (falls back to America/Denver if missing or invalid). Try the demo also sends the browser zone.
11. **README hero** — target reference `15-readme-hero.png` (1600×900, light): browser frame showing the Acme Robotics detail (revisits + totals are the story) with a phone frame showing the list, on a soft warm canvas. Crop: browser 1180×760 at (80,64); phone 340×690 right. Demo data = fixture user A plus Initech/Hooli from the demo seed. No pins, no demo banner, URL bar reads the live demo host. GitHub renders it at ~880px wide: all key text is ≥12px after scaling. Production image is **captured by a Playwright script from the real app** (see item 12); the mock is the reference it must match.
12. **README hero capture spec** (script at the repo root, `scripts/readme-hero.ts`, run manually or in a release workflow; not in the PR gate):
   - **Target app:** a local or test build (`npm run dev` against a seeded DB); `?screenshot=1` does not exist in production. Light mode only. Locale en-US, time zone America/Denver, `today` frozen to **2026-10-09** (Playwright `clock.setFixedTime('2026-10-09T18:00:00Z')`) so day counts match the fixture.
   - **Data state:** Try the demo (POST demo) → demo user seeded from `fixtures/slice-1.json` user A (Acme Robotics, Northwind Labs, Globex) plus demo seed Initech (Screen, Oct 2) and Hooli (Closed, Sep 10). Hide the demo banner with a `data-screenshot` attribute on `<html>` (set by the script via `?screenshot=1`; ignored in production otherwise). No pins, no toasts, no focus rings: blur active element, move the mouse to (0,0), wait for `networkidle` and fonts (`document.fonts.ready`).
   - **Shot A (desktop):** route `/applications/<Acme Robotics id>`, viewport **1440×900**, DPR 2, clip x 0, y 0, 1440×928 (header + detail through the 5th timeline row; content may be cut at the bottom).
   - **Shot B (mobile):** route `/applications`, viewport **390×844**, DPR 2, clip 0,0,390×844 (header, title, Add, five cards).
   - **Composition** (a second Playwright page rendering a local HTML template `scripts/hero-frame.html` (repo root) with the two PNGs as `<img>`): canvas **1600×900**, background #F2F1EC with two soft radial tints (#E4DFFB top-right, #E3EFE8 bottom-left). Browser frame 1180×760 at (80,64), radius 16, 40px light title bar with three dots and a URL pill showing the live host + `/applications/acme-robotics`, shadow e3; Shot A scaled to 1180 wide. Phone frame 340×690 at (1190,150), ink bezel 12px, radius 44 / 34 inner; Shot B scaled to 316 wide. Render at DPR 1 and also DPR 2.
   - **Output:** `docs/images/readme-hero.png` (1600×900) and `docs/images/readme-hero@2x.png` (3200×1800); README uses the 1x with `width="100%"` and alt text "pipeline: an application's stage history with revisits and time per stage, next to the list on mobile". Commit the PNGs; rerun the script when the UI changes.
   - **Check:** visually diff against `docs/design/png/15-readme-hero.png` (layout, not pixels); every text in the shot is ≥12px at 880px display width.


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
| I18 | Search + filter | Search field: edge border, focus ring, ✕ clear 44×44 with aria-label, Esc clears; debounced 200ms; results count announced politely. Filter chips: `aria-pressed`, selected = ink fill + white text (16.65:1 chip vs canvas; count 10.36:1), unselected hover adds tint and keeps the 3.80:1 edge; arrow-free Tab order; active chip scrolled into view on mobile. No-results names query + stage and offers both resets. |
| I19 | Character counter | Live "n / 280" (muted 7.03:1); warn #8A5A00 at 260+ (5.93:1 on white); danger at 281+ with "N characters over" and the submit disabled with that reason; aria-live polite only from 260. |
| I20 | Segmented control / section nav | Selected segment = surface + 1px edge (3.30:1 vs subtle) + semibold + `aria-current`; desktop section nav selected = edge border + 3px accent inset (7.44:1). Not shadow or fill alone (white vs subtle is only 1.15:1). 44px tall. |
| I21 | Combobox (time zone) | Trigger is an input-styled button (edge 3.80:1, focus ring); open list: highlighted option = hover tint + 3px accent edge; selected = check icon; type-ahead, arrows, Enter, Esc returns focus to the trigger; Sheet on mobile with 16px search input. |
| I22 | Per-row destructive action | Per-session Sign out: secondary at rest; hover/pressed = danger tint + danger border (6.57:1 on white; 5.75:1 on tint) + danger text; aria-label names the device; pending spinner; focus moves to the next row's button after removal; current device shows a reason instead of a button. |
| I23 | Disabled form (demo) | Whole password form disabled with a warn alert above it (5.37:1) that gives the reason and a way out; inputs are visibly inert (subtle fill), button `aria-disabled`. |
| I17 | Time | All dates/times shown in the user's time zone; Settings › Security history states the zone; the zone is editable in Settings › Preferences. |

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
| Settings · Security · Preferences | Account, Profile | Page + its two sections |
| Sign out (per device) / Sign out everywhere | Revoke, End session | Toast "Signed out {device}." |
| This device | Current session | Badge |
| Change password | Update password | Pre-save line: "Changing your password signs out your other N devices. You stay signed in here." |
| Current password is incorrect. | Wrong password | Only field-level error that names a field on an auth form (the user is already signed in) |
| Demo accounts can't change their password. | — | Reason on the disabled form |
| Time zone | Timezone, TZ | "Your browser reports X. Use browser time zone" |
| Search company or role | Search… | Search placeholder |
| No applications match “{q}” in {Stage} | No results found | Plus Show all stages / Clear search and filter |
| N / 280 · N characters over | — | Stage-change note counter |
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
New components in v2:
| Foreground | Background | Ratio |
|---|---|---|
| warn #8A5A00 (counter 260+) | surface #FFFFFF | 5.93:1 |
| white 75% on ink (selected chip count) | ink #17171C | 10.36:1 |
| selected chip ink fill | canvas #F7F7F5 | 16.65:1 (UI) |
| edge #85837A (selected segment border) | subtle #EFEFEB | 3.30:1 (UI) |
| surface #FFFFFF (selected segment fill) | subtle #EFEFEB | 1.15:1 — **not** used as the only indicator |
| accent #4F3CC9 (section nav inset, combobox option edge) | surface / hover | 7.44:1 / 6.65:1 |
| danger #B42318 (per-session hover border + text) | surface / danger-tint | 6.57:1 / 5.75:1 |
| muted #5A5952 (pre-save notes on subtle 60%) | #F5F5F3 | 6.44:1 |
| success #1E7A46 (inline "Saved.") | surface | 5.35:1 |
| ink tab underline (mobile nav) | surface | 17.86:1 |

`--border` (1.41:1) is decorative only; anything a user must perceive as a control boundary uses `--edge`. Disabled controls are exempt from contrast but always carry a reason text that passes 4.5:1.

## 8. API / data needs implied by the screens (beyond SPEC)
1. **List** `GET /api/applications?q=&stage=`: per application `currentStage`, `daysInCurrentStage` (or events so the client runs `computeTimeline`), `lastActivityAt`, `lastActivityKind` (`stage_change` + stage | `edited`). `q` matches company or role (ILIKE, trimmed, ≤100 chars); `stage` is one of the enum. Response includes `countsByStage` for the current `q` (for the chip counts) and `total`. Filtering can be client-side in slice 1 if the list is unpaginated, but the params keep the URL contract stable.
2. **Detail**: events plus `visits[]` (stage, enteredLocal, days, current, visitNumber) and `totals` with visit counts; `latestEventLocalDate` for the date picker; user `timeZone` and `today`.
3. **Stage move**: `note` max **280** chars (zod), 422 `{ field: "note", message }` when over.
4. **Sign-up / demo**: body adds `timeZone` (IANA, from `Intl.DateTimeFormat().resolvedOptions().timeZone`); server validates against `Intl.supportedValuesOf('timeZone')`, falls back to America/Denver.
5. **Preferences**: `PATCH /api/me/preferences { timeZone }` (validated IANA; allowed for demo users). `GET /api/meta/time-zones` is optional; the client can use `Intl.supportedValuesOf` with offsets computed locally.
6. **Me**: email, `emailVerified`, `isDemo`, `demoExpiresAt`, `timeZone`.
7. **Sessions** `GET /api/sessions`: opaque `id` (not the token hash), `device` (browser + OS parsed from user_agent), `ip`, `createdAt`, `lastSeenAt`, `isCurrent`. **No location.**
8. **Per-session revoke** `DELETE /api/sessions/:id`: deletes one session of the caller; 404 for unknown/other users; 409 when `:id` is the current session (the UI never offers it); writes an auth event `session_revoked`. CSRF + Origin as for all non-GET.
9. **Sign out everywhere** `POST /api/sessions/revoke-all` (SPEC), unchanged.
10. **Change password** `POST /api/me/password { currentPassword, newPassword }`: verify current (failures count toward the login lockout), apply 12–128 + HIBP, reject equal to current; on success delete every **other** session, rotate the current session id, write `password_changed` auth event. 403 for demo users. Rate-limited per account.
11. **Auth events** (last 50): add kinds `password_changed` and `session_revoked` to SPEC's audit list; return display label, parsed device, ip, created_at.
12. **Demo "Create your own account"**: client calls the normal sign-out, then routes to `/signup`; no new endpoint.
13. **Error shapes**: lockout and resend return `retryAfterSeconds`; 422s are field-keyed `{ field, message }`.
14. **SPEC/fixture follow-ups for Tech Lead**: SPEC currently lists no change-password, per-session revoke, preferences, event-note limit or the two new audit kinds; they need adding in the PR that builds them.

## 9. Open questions for Tech Lead
Resolved in v2 (Tech Lead, Oct 9): search + filter yes; note 280; page = Settings (Security + Preferences); change password yes; sessions device + IP only; per-session Sign out yes; README hero captured by script; time zone auto-detect + Preferences; demo CTA signs out first.

Closed (Tech Lead, Oct 9, final):
1. Time-zone change: the general note in Preferences only ("re-counts days in stage… history doesn't change"); no exact-effect preview.
2. Per-session sign-out of the current device: the server refuses it (`DELETE /api/sessions/:id` on the current session → 409), and the UI never shows a per-session Sign out on "This device".
3. `?screenshot=1` (hides the demo banner for the README capture) exists only in local and test builds, never in production; the capture script runs against a local build.
4. Search matches company and role only (not notes).

No open questions.

## 10. Files
- `BRIEF.md` (this file); `scripts/contrast.py`, `scripts/gen.py` (mock generator), `scripts/render.mjs` (Playwright renderer), `scripts/package.json`
- `mocks/01-signin.html` … `mocks/17-settings-preferences.html`
- `mocks/13-settings-security`, `13b-settings-security-demo`, `16-list-no-results`, `17-settings-preferences` (new in v2; `13-security` removed)
- `png/NN-*-desktop.png` (1440 wide, full page) and `png/NN-*-mobile.png` (390 wide) for 01–14, 13b, 16, 17; `png/15-readme-hero.png` (1600×900, target reference for the capture script)
- `BRIEF.v1.md` (previous version)
