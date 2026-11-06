---
name: NoFit Proof Network
description: Every record handled as court evidence; numbered exhibits, sealed by hash, signed through a chain of custody.
colors:
  bench-gray: "#eef0ef"
  form-white: "#ffffff"
  ink: "#0d1014"
  ink-2: "#383e46"
  ink-3: "#5a616b"
  steel: "#d6dad8"
  steel-2: "#b8bebb"
  mist: "#e3e6e4"
  marker-yellow: "#ffc40c"
  marker-edge: "#c99a00"
  evidence-teal: "#0b6e50"
  evidence-teal-bg: "#e2f1ea"
  evidence-teal-line: "#9acfb8"
  caution-amber: "#855600"
  caution-amber-bg: "#fff3d1"
  caution-amber-line: "#ecc96f"
  blocker-red: "#b3261e"
  blocker-red-bg: "#fcebe9"
  blocker-red-line: "#f0b2ab"
typography:
  hero:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "76px"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.035em"
    fontVariation: "'wdth' 86"
  hero-mobile:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "52px"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.035em"
    fontVariation: "'wdth' 86"
  display-mobile:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 86"
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 86"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 86"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.625
  body-small:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 70"
  numeral:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 70"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  hairline: "1px"
  tag: "2px"
  control: "3px"
  sheet: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  sheet-x: "20px"
  stack: "24px"
  section: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.form-white}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-marker:
    backgroundColor: "{colors.marker-yellow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.form-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-ghost:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
  button-danger:
    backgroundColor: "{colors.form-white}"
    textColor: "{colors.blocker-red}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.form-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  form-sheet:
    backgroundColor: "{colors.form-white}"
    rounded: "{rounded.sheet}"
    padding: "16px 20px"
  exhibit-tent:
    backgroundColor: "{colors.marker-yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.numeral}"
    height: "28px"
  seal-strip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.form-white}"
    height: "32px"
  finding-tag-settled:
    backgroundColor: "{colors.evidence-teal}"
    textColor: "{colors.form-white}"
    height: "32px"
  finding-tag-void:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink-3}"
    height: "32px"
  nav-item-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.form-white}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
---

# Design System: NoFit Proof Network

## Overview

**Creative North Star: "The Evidence Room"**

Every NoFit record is handled as court evidence. A request, its verdict, the proof contract, the payment and each proof run are numbered exhibits laid on a bench-gray table, written on white custody forms, sealed by their hashes and signed through a chain of custody. The interface is a working evidence room, not a dashboard: dense, ruled, legible at arm's length, with three physical devices doing the identifying work (the yellow exhibit tent, the ink seal strip, the punched finding tag).

Density is that of a filled-in form: ruled cells with condensed uppercase field labels, plain 16px entries, hairline steel rules between rows. Colour is almost absent; the ground is gray, the sheets white, the type ink. Yellow belongs to exhibits; teal, amber and red belong to evidence states. Archivo carries everything, its width axis doing the hierarchy work: headings run slightly narrow, labels and numerals fully condensed. JetBrains Mono appears only where the value is a machine value.

This world refuses the card-grid SaaS dashboard (stat tiles, icon-topped cards in rows of three) and the paper-and-stamp editorial look (cream paper, serif display, rubber-stamp rotations, rough edges).

**Key Characteristics:**
- Bench-gray ground, white form sheets with 4px corners, ink type.
- Yellow A-frame tents with condensed black numerals mark exhibits and nothing else.
- Ink seal strips carry the sha256 hash that fixes a record.
- Solid, corner-clipped finding tags with a punched hole print states.
- Every state has a shape as well as a colour.
- One display element per record page; one motion grammar for the whole product.

## Colors

A near-monochrome evidence room: gray ground, white sheets, ink, with one exhibit yellow and three semantic evidence hues held to strict jobs.

### Primary
- **Marker Yellow** (#ffc40c): the exhibit marker. Fills the A-frame tent, the "SEALED/LOGGED" label cell of a seal strip, the marker action button (the one step a page exists to take), the current-step bar on the custody strip, text selection and the input focus halo (at 40%). Its bottom edge is shaded with **Marker Edge** (#c99a00) as an inset 0.18em band, so the tent reads as a folded card standing on the bench.

### Secondary
- **Evidence Teal** (#0b6e50, with #e2f1ea ground and #9acfb8 line): verified evidence. Fit and conditional-fit verdicts, passed runs, captured payments, "Real" provenance, conditions that proof verified.

### Tertiary
- **Caution Amber** (#855600, with #fff3d1 ground and #ecc96f line): warnings and things in motion. Insufficient information, needs review, payment pending, running, inconclusive, human overrides, simulated providers.
- **Blocker Red** (#b3261e, with #fcebe9 ground and #f0b2ab line): blockers and failures only. No-fit, failed runs, denied or failed payments, the blocked custody step, the danger button.

### Neutral
- **Bench Gray** (#eef0ef): the page ground; also hover wash on nav and disclosures.
- **Form White** (#ffffff): every sheet, card, sidebar, input and table surface.
- **Ink** (#0d1014): body text, primary button, active nav drawer, seal strips, custody-step numerals, the landing honesty band.
- **Ink 2** (#383e46): secondary text and supporting copy; the neutral finding-tag fill.
- **Ink 3** (#5a616b): meta lines, field labels, placeholders, dashed pending outlines.
- **Steel** (#d6dad8): sheet borders and the hairline rules between form cells and table rows.
- **Steel 2** (#b8bebb): stronger borders on secondary buttons and inputs, dashed future-step bars, scrollbars.
- **Mist** (#e3e6e4): the void ground; struck-through tags and seals, neutral badges, ghost-button hover.

### Named Rules
**The Exhibit Yellow Rule.** The yellow tent means an exhibit and nothing else. Numbering is fixed: 01 request, 02 verdict, 03 contract, 04 payment, 05 and up proof runs. Steps, counters, nav and badges never wear the tent; the custody strip uses an ink square numeral instead.

**The Three Jobs Rule.** Red is only for blockers and failures, teal only for verified evidence, amber only for warnings and pending work. A colour that does not carry one of those meanings stays ink or gray.

## Typography

**Display Font:** Archivo (variable, width axis) with ui-sans-serif, system-ui fallback
**Body Font:** Archivo
**Label/Mono Font:** JetBrains Mono (400, 500), for hashes and code identifiers only

**Character:** one grotesque doing every job by changing width. Headings run at width 86 (slightly narrow, bold, tight negative tracking); field labels, tent numerals, finding tags and seal labels run fully condensed at width 70, uppercase and tracked out. The mono is a tool, not a texture.

### Hierarchy
- **Hero** (800, 52px mobile / 76px desktop, 0.98): landing headline only.
- **Display** (700-800, 32px mobile / 40px desktop, 1.05): the verdict or status headline on a record page; the page title on index pages; landing section heads.
- **Title** (600-700, 22px, 1.25): record-page titles (PageHeader size "record"), section heads such as "Why", the wordmark, the landing lede.
- **Body** (400, 16px, 1.625): findings, verdict copy, explanations; capped near 68ch.
- **Body small** (400, 14px): meta lines below titles, step labels, table cells, callouts.
- **Label** (600-800, 12px, 0.06-0.08em tracking, uppercase, width 70): form-cell field names, table heads, seal labels, finding tags at xs, badges.
- **Mono** (400, 12px): sha256 hashes (shortened), scope strings, policy codes, citation refs, version numbers, reason codes.

### Named Rules
**The Fixed Ramp Rule.** The app uses 12 / 14 / 16 / 22 / 40 (32 on small screens) and nothing between. The landing alone adds a 52 / 76 hero.

**The One Display Rule.** A record page carries one display element. The record is named in a quiet 22px title; the verdict or status headline below it is the only 32/40px type on the page.

**The Honest Mono Rule.** JetBrains Mono only when the string is a machine value someone might copy or compare (hash, scope, code, version). Never for labels, banners or atmosphere.

**The No Eyebrow Rule.** Nothing sits above a heading. Supporting metadata goes below the title, never as a kicker over it.

## Layout

Workspace: a fixed 256px white sidebar (the case-file index) beside a bench-gray main column capped at 1280px, with 16 / 24 / 40px gutters by breakpoint and 32-40px top padding. Below lg the sidebar collapses into a sticky white header with a disclosure menu. A thin 12px "Fictional demo" ribbon runs across the top of the main column.

Record pages are a two-column grid on desktop: the record (verdict sheet, findings, disclosures) on the left, exhibit 01 (the request) as a form sheet on the right; single column on mobile with the request following. Sheets stack with 24px between them; inside, headers pad 16px by 20px and are ruled off from their body.

Form cells use container queries: label left in a 9.5rem column with the entry right when the cell is at least 28rem wide, label printed above the entry when narrower. The custody strip (Rail) is a horizontal equal-column grid from md up whose labels wrap rather than scroll; on phones it becomes a one-line "step n of m" summary that expands.

Landing: max 72rem container, hero split 1.1fr / 1fr with the evidence-bag specimen on the right, then full-bleed white and ink bands.

## Elevation & Depth

Flat by default. Depth comes from the gray-to-white tonal step and hairline steel borders, not from shadows. Sheets carry a barely-there 1px contact shadow so they sit on the bench rather than float. The only lifted objects are the two specimens that stand in for a physical thing: the landing evidence bag and the login persona sheet.

### Shadow Vocabulary
- **Contact** (`box-shadow: 0 1px 2px rgba(13,16,20,0.05)`): every form sheet, verdict sheet and replay comparison.
- **Button contact** (`box-shadow: 0 1px 2px rgba(13,16,20,0.2)`): the ink primary button.
- **Marker fold** (`box-shadow: inset 0 -2px 0 #c99a00` on buttons, `inset 0 -0.18em 0 #c99a00` on tents): the shaded bottom edge of anything yellow.
- **Specimen lift** (`box-shadow: 0 2px 4px rgba(13,16,20,0.06), 0 24px 48px -24px rgba(13,16,20,0.28)`): the landing evidence bag only (a 0.08 / 0.5 variant on the login persona sheet).

### Named Rules
**The Bench Rule.** Records lie on the bench; they do not hover. No elevation on hover, no floating cards, no glass.

## Shapes

Square-shouldered with small, graded corners: 4px for sheets, disclosures and empty states; 3px for buttons, inputs, callouts and nav items; 2px for badges, tags, avatars and step numerals; 1px for the tiny legend swatches. Borders are 1px steel hairlines; a 3px ink top rule marks landing principle columns.

Three clip-path silhouettes are the signature forms:
- **The tent**: a trapezoid, `polygon(14% 0, 86% 0, 100% 100%, 0 100%)`, the front view of an A-frame exhibit marker.
- **The finding tag**: a cardboard evidence tag with its two left corners clipped at 0.55em and a 0.2em string hole punched through by a radial-gradient mask.
- **The seal strip**: a full-width rectangular band with a yellow label cell at its left end.

State shape is a system rule, not decoration: **solid** fill means settled, **dashed outline** means pending or ahead, **struck through on mist** means void, superseded or excluded.

### Named Rules
**The Shape Carries State Rule.** Every state has a shape as well as a colour. A finding tag, seal strip or custody step must stay distinguishable in grayscale.

## Components

### Buttons
Compact, square-shouldered, pressed rather than lifted.
- **Shape:** gently squared corners (3px), 14px semibold, 10px by 16px padding (landing CTAs step to 12px by 20px at 16px).
- **Primary:** ink fill, white text, button contact shadow; hover lightens to #272c33.
- **Marker:** yellow fill, ink bold text, marker fold underneath; hover #ffcf3d. One per view: the action that moves the evidence forward ("Review the proof", "Try the buyer to seller flow").
- **Secondary:** white with a steel-2 border that turns ink on hover.
- **Ghost:** text only, ink-2; mist wash on hover.
- **Danger:** white with a red-line border and red text; red-bg wash on hover.
- **Press:** every button sinks 1px on active; 150ms ease-out on colour and transform. Disabled drops to 50% opacity.

### Finding Tags (status)
The state printed on an evidence tag: condensed, extrabold, uppercase, 0.05em tracking, a 3px-stroke glyph (check, triangle, x, dashed circle, minus) plus the plain-words label, the machine code kept as a tooltip.
- **Sizes:** xs 20px and sm 24px (tables, lists), md 32px, lg 44px (the verdict), xl 64px (the replay result).
- **Fills:** teal, amber, red, ink-2 (neutral) or ink, all with white text. Cancelled, voided, reversed and excluded print struck through on mist in ink-3.
- **Rule:** one large finding tag per screen, beside the verdict or result the page exists to deliver.

### Badges
Small 2px-cornered labels on tinted grounds with an inset 1px ring in the matching line colour; 12px medium sans. `mono` only for codes, scopes and versions.

### Cards / Form Sheets
- **Corner Style:** 4px.
- **Background:** white on the bench-gray ground.
- **Shadow Strategy:** contact shadow only (see Elevation & Depth).
- **Border:** 1px steel; header ruled off with a steel line.
- **Internal Padding:** 16px by 20px headers; an optional small exhibit tent sits left of the title; meta below the title in 14px ink-3.

### Form Cells (KeyValue)
Ruled rows between steel hairlines; the field name is a 12px condensed uppercase ink-3 label, the entry 14px ink. Side-by-side at 28rem and wider, stacked below. The verdict sheet's "Blocked by / Holds if" row is the same cell enlarged, its label coloured by the finding's job.

### Inputs / Fields
- **Style:** white, 1px steel-2 border, 3px corners, 8px by 12px padding, 14px ink text, ink-3 placeholder.
- **Hover:** border to ink-3.
- **Focus:** border to ink plus a 4px marker-yellow halo at 40%. Elsewhere, focus-visible is a 2px ink outline offset 2px.

### Navigation
The case-file index: 14px ink-2 items with a 16px ink-3 line icon, 8px by 12px padding, 3px corners. Hover washes bench gray. The open drawer is inked (ink fill, white semibold text) with its icon in marker yellow. Below lg the same list lives inside a sticky header's disclosure menu.

### Exhibit Tent (signature)
The yellow A-frame marker with a condensed extrabold tabular numeral: sm 20px tall at 12px, md 28px at 16px, lg 40px at 22px. Linked tents rise 2px on hover. Large tents sit beside record titles and the verdict headline; small ones in sheet headers, evidence lists and the replay comparison. The wordmark borrows the tent with "NF" because the product itself is the first exhibit.

### Seal Strip (signature)
The tamper tape across a record, at least 32px tall, 12px type: a condensed uppercase label cell ("Sealed", "Logged") in yellow at the left, then "sha256" plus the shortened hash in mono, a value and right-aligned meta. Sealed is ink with white text; pending is a dashed ink-3 outline on white; void is mist with the label and value struck through. It closes the record it belongs to, dividing one exhibit from the next.

### Custody Strip (Rail)
A row of steps, each with a bar above and a 20px square numeral. Done: 3px ink bar, ink square with a check. Current: 5px yellow bar, ink square with a yellow numeral. Ahead: dashed steel-2 bar, dashed ink-3 outline square. Blocked: red bar, red square with an x. Labels may link to the record that completed the step.

### Disclosure
Evidence on demand: a closed-by-default white sheet whose summary states what is inside and how much ("7 cited", "3 append-only entries"); the chevron turns 180 degrees on open.

### Motion
One authored grammar, transforms and clipping only, so nothing fades in:
- **Seal close** (760ms, expo-out, 200ms delay): a sealed strip wipes closed across its record, left to right, once per page.
- **Strike draw** (420ms, expo-out, 250ms delay): on the replay, a 2px ink line strikes through the superseded verdict.
- **Settle** (620ms, expo-out, 560ms delay): the new verdict drops 12px from a 1.5 degree tilt into place.
Small interface transitions (150ms colour, 1px press, 2px tent rise, chevron turn) sit beneath it. Under reduced motion every animation and transition completes instantly.

## Do's and Don'ts

### Do:
- **Do** mark every record with its exhibit number in a yellow tent: 01 request, 02 verdict, 03 contract, 04 payment, 05+ proof runs.
- **Do** give every state a shape: solid finding tag for settled, dashed outline for pending, struck through on mist for void, superseded or excluded.
- **Do** keep one display element per record page: the record title at 22px, the verdict or status headline at 32/40px.
- **Do** stay on the 12 / 14 / 16 / 22 / 40 ramp in the app; the 52 / 76 hero is for the landing only.
- **Do** close a sealed record with an ink seal strip carrying its shortened sha256 hash in mono.
- **Do** print field labels as 12px condensed uppercase ink-3 inside ruled form cells, with metadata below titles.
- **Do** reserve the marker button for the single action that moves the evidence forward on a view.
- **Do** honour reduced motion and animate only with transforms and clip-path.

### Don't:
- **Don't** use the yellow tent for steps, counts, nav, badges or decoration; a custody step is an ink square numeral.
- **Don't** use red for anything but blockers and failures, teal for anything but verified evidence, or amber for anything but warnings and pending work.
- **Don't** put an eyebrow or kicker above a heading.
- **Don't** set labels, banners or atmosphere in mono; JetBrains Mono is for hashes and code identifiers only.
- **Don't** add a second display-size element to a record page, or invent sizes between ramp steps.
- **Don't** fade content in, run more than one seal close per page, or lift sheets on hover.
- **Don't** build card-grid SaaS dashboards (stat-tile rows, icon-topped cards in threes) or the paper-and-stamp editorial look (cream paper, serif display, rotated rubber stamps).
