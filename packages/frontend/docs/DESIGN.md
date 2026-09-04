---
name: Pecunity
description: Broker-calm cockpit for self-custodied DeFi — white hairline-ruled ground, one Brand-Blue band per page carrying the money moment.
colors:
  brand-blue: "#4568d0"
  brand-blue-hover: "#3a5ac0"
  band-deep: "#3a57b0"
  ink: "#0e1116"
  white: "#ffffff"
  wash: "#f2f4fd"
  hairline: "#e4e8f4"
  input-border: "#d9dfef"
  body-text: "#414c66"
  muted-text: "#63749c"
  positive: "#1e7f4f"
  destructive: "#c2402a"
  warning: "#8a6410"
  warning-surface: "#faf3e3"
  warning-border: "#ead9ac"
  on-band-sub: "#f0f4fe"
  on-band-line: "rgb(255 255 255 / 0.22)"
  on-band-positive: "#9fe6c0"
  selection: "#dde4fa"
typography:
  display:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.75rem
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5rem
    letterSpacing: "-0.025em"
  stat:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.75rem
  body:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.25rem
  label:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1rem
  mono:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1rem
  wordmark:
    fontFamily: "Chillax, Geist Variable, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
rounded:
  sm: "0.25rem"
  md: "0.5rem"
  lg: "0.75rem"
  full: "9999px"
spacing:
  xs: "0.375rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  section: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.brand-blue}"
    textColor: "{colors.white}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0.5rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.brand-blue-hover}"
    textColor: "{colors.white}"
  button-outline:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0.5rem 1rem"
  button-outline-hover:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
  button-secondary:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.body-text}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0.5rem 1rem"
  chip-account:
    backgroundColor: "{colors.white}"
    textColor: "{colors.body-text}"
    rounded: "{rounded.full}"
    padding: "0.375rem 0.75rem"
  input-field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
---

# Design System: Pecunity

## Overview

**Creative North Star: "The Broker-Calm Cockpit"**

Pecunity's frontend is category-standard fintech at the craft bar of Trade Republic
and Robinhood: a calm, number-first consumer-broker surface for self-custodied DeFi
money. The ground is pure white, structured by hairline rules instead of card boxes;
the single committed gesture is the **band** — a full-bleed Brand-Blue field flush
under the top bar that carries each page's money moment at display size. Everything
else stays quiet so the numbers can speak: one accent color, one typeface, tabular
numerals everywhere, and semantic green/red reserved strictly for money meaning.

The build deliberately refuses crypto-casino glow and dark terminal density (direction
contract, `index.html`). Depth is nearly flat; hierarchy comes from type weight, the
`#F2F4FD` wash, and ruled edges. Trust is designed in: honest loading skeletons,
explicit error + retry states, live/reconnecting freshness signals, and provenance
badges on prices.

**Key Characteristics:**
- White ground ruled by `#E4E8F4` hairlines; content is tables and ruled sections, not floating cards.
- One accent — Brand Blue `#4568D0` — doing triple duty as action color, chart ink, and the band.
- The band inverts the palette: white text, translucent white lines, its own positive green.
- Geist everywhere, Geist Mono for on-chain identifiers, Chillax for the lowercase wordmark only.
- Global `tabular-nums`; every figure aligns in columns by default.

## Colors

A near-monochrome white/blue-gray palette with a single saturated blue and muted, dignified semantic colors — no neon.

### Primary
- **Brand Blue** (`#4568d0`): the only accent. Primary buttons, links, focus rings, the caret, the value-chart line and area fill, and the band itself. Hover state darkens to **Brand Blue Hover** (`#3a5ac0`).
- **Band Deep** (`#3a57b0`): bottom stop of the band's vertical gradient (`from #4568d0 to #3a57b0`). Used only inside the band.

### Neutral
- **Ink** (`#0e1116`): foreground text on white; headings, primary table values.
- **White** (`#ffffff`): the page ground and card/control surfaces.
- **Wash** (`#f2f4fd`): the light-blue tint for secondary buttons, chips, hovers, active segmented pills, muted surfaces, and skeletons. The only fill that sits on white.
- **Hairline** (`#e4e8f4`): all structural rules — top bar edge, section underlines, table row separators, chip and badge borders.
- **Input Border** (`#d9dfef`): slightly firmer line reserved for form controls (inputs, selects, outline buttons).
- **Body Text** (`#414c66`): secondary body copy (e.g. assurance bullets, chip labels).
- **Muted Text** (`#63749c`): tertiary text — table headers, meta lines, helper copy, inactive nav.
- **Selection** (`#dde4fa`): text-selection background on white ground.

### Semantic (money meaning only)
- **Positive** (`#1e7f4f`): profit figures, deposit markers, "live" dot. Muted green, not neon.
- **Destructive** (`#c2402a`): losses, withdraw markers, error text, destructive buttons. Muted brick, not alarm red.
- **Warning** (`#8a6410`) on **Warning Surface** (`#faf3e3`) with **Warning Border** (`#ead9ac`): callout boxes for degraded states (low gas reserve, stale context).

### On-Band (the inverted palette)
- **White** (`#ffffff`): primary text and focus outlines on the band.
- **On-Band Sub** (`#f0f4fe`): secondary text on the band (labels above the money figure, back links, meta rows).
- **On-Band Line** (`rgb(255 255 255 / 0.22)`): borders, input edges, and skeleton fills on the band.
- **On-Band Positive** (`#9fe6c0`): the success tint that stays legible on blue (e.g. copy-confirmed check).

### Named Rules
**The One Accent Rule.** Brand Blue is the only brand color on any screen. Green and red appear exclusively where money meaning demands them (PnL, deposit/withdraw, live/failed states); amber only inside warning callouts. Nothing else is ever colored.

**The Band Inversion Rule.** Inside `.band`, the palette flips: text is white/`on-band-*`, selection becomes translucent white, and `:focus-visible` outlines turn white. Never place Ink text or the standard focus ring on the band.

## Typography

**Display/Body Font:** Geist Variable (with system-ui, sans-serif) — self-hosted via fontsource.
**Mono Font:** Geist Mono Variable (with ui-monospace) — addresses, tx hashes, token balances.
**Wordmark Font:** Chillax 600 (Fontshare CDN) — the lowercase "pecunity" wordmark, nothing else.

**Character:** One quiet grotesk at a handful of sizes; hierarchy is carried by weight (400/500/600) and color (Ink → Body Text → Muted Text), not by size jumps. Headings and money figures are `font-semibold tracking-tight`. `font-variant-numeric: tabular-nums` is set globally on `body`.

### Hierarchy
- **Display** (600, 3rem `text-5xl`, tight tracking): the money moment — one USD figure per page, always on the band.
- **Headline** (600, 1.125rem `text-lg`, tight tracking): page-level headings ("Your Vaults", "Sign in"); the vault name on the band uses 1.25rem `text-xl`.
- **Title** (600, 1rem `text-base`, tight tracking): section headings above hairline rules ("Value history", "Token Balances", "Execution History").
- **Stat** (600, 1.25rem `text-xl`): performance-grid values (PnL, net deposits, costs).
- **Body** (400, 0.875rem `text-sm`): all UI copy, table cells, buttons, form labels (labels at 500).
- **Label** (500, 0.75rem `text-xs`): table headers (Muted Text), meta lines, chips, badges, range pills. Never uppercase, never letter-spaced.
- **Mono** (400, 0.75rem): truncated addresses (`0x1234…abcd`), hashes, and balance columns.

### Named Rules
**The Wordmark Rule.** Chillax renders exactly one string — lowercase "pecunity" — in the shell/public header bar (1.25rem), on the connect band (1.875rem), and in the public-page footer (1rem). Chillax never sets a heading, a button, or any other copy.

**The Tabular Rule.** All numerals are tabular and columns of figures are right-aligned. On-chain identifiers are always Geist Mono, truncated `6…4`, with a copy affordance.

## Layout

A single centered column: `max-w-5xl` (64rem) with `px-6` (px-4 in the shell bar on mobile), used identically by the top bar, the band's inner container, and `main`. The band itself is full-bleed; only its content is constrained. `main` runs `pt-8 pb-20`.

Vertical rhythm on detail pages is `space-y-10` (2.5rem) between sections. Each section opens with a Title heading over a hairline rule (`border-b border-border pb-3`), content following at `pt-4`. Data lives in full-width ruled tables: header row in Label type (Muted Text), body rows `py-4` separated by hairlines with `last:border-0`; clickable rows get `cursor-pointer hover:bg-muted/60`. Numeric columns are right-aligned; secondary columns collapse below `sm`/`md` (`hidden md:table-cell`).

Forms pair up in a `grid gap-6 md:grid-cols-2`. The connect page is a narrower `max-w-md` column under its own centered band. Page order follows the broker canon (docs/wireframes.md 3.5): band (identity + value) → chart → performance → positions, before any actions.

## Elevation & Depth

Effectively flat. Structure is conveyed by hairlines and the Wash tint, not shadows: no card shadows, no overlays, no blur. The only depth cues are (a) the band's subtle top-to-bottom gradient (`#4568d0 → #3a57b0`) and (b) the Tailwind micro-shadows (`shadow` / `shadow-sm`) baked into the button component — barely-visible edges, not elevation.

### Named Rules
**The Hairline-Not-Box Rule.** Primary content (balances, history, performance) is never boxed. A bordered `rounded-md` container is reserved for interactive islands — forms (Deposit/Withdraw), warning callouts, dashed-border empty states — and for the dense execution-history table wrapper.

## Shapes

Two form languages, strictly assigned:
- **Rounded rectangles** (`0.5rem` / `rounded-md`): buttons, inputs, selects, form cards, warning callouts, skeleton blocks. `0.25rem`/`0.75rem` exist as tokens but `md` dominates.
- **Pills** (`rounded-full`): everything chip-like — the account/address chip, the BSC network tag, range-toggle segments, price-source badges, freshness/legend dots.

Borders are 1px always. Empty states may use `border-dashed`. No sharp corners, no large radii, no clipping tricks.

## Components

### Buttons
- **Shape:** rounded-md (0.5rem), `text-sm font-medium`, `inline-flex items-center gap-2`.
- **Primary:** Brand Blue fill, white text, `h-9 px-4 py-2`; hover `bg-primary/90`. Often full-width in forms (`w-full`), often leading a 1rem icon.
- **Outline:** white fill, `border-input` hairline; hover fills with Wash. The retry/pagination/secondary-action variant.
- **Secondary:** Wash fill, Body Text; hover `bg-secondary/80`.
- **Ghost / Link:** transparent, hover Wash / underlined Brand Blue text.
- **Destructive:** `#c2402a` fill, white text.
- **Sizes:** sm `h-8 px-3 text-xs`, default `h-9`, lg `h-10 px-8`, icon `h-9 w-9`.
- **States:** `focus-visible:ring-1 ring-ring`; disabled `opacity-50 pointer-events-none`.

### Chips
- **Account chip (shell):** pill, hairline border, `px-3 py-1.5 text-xs`, mono truncated address + copy icon (flips to a Positive check for 2s); hover Wash.
- **Tags/badges:** pill, hairline border, `px-2 py-0.5 text-xs` (network "BSC" on the band uses On-Band Line border); price-source badge shrinks to `text-[10px]`.
- **Range toggle:** segmented pills (`24h / 7d / 30d / Since creation`); active = Wash fill + semibold Ink, inactive = medium Muted Text with hover to Ink; `aria-pressed` carries state.

### Cards / Containers
- **Corner Style:** rounded-md.
- **Background:** white; never tinted.
- **Border:** hairline (`#e4e8f4`); dashed for empty states.
- **Shadow Strategy:** none (see Elevation).
- **Internal Padding:** `p-4` (forms), `p-6` (empty states).

### Inputs / Fields
- **Style:** white fill, `border-input` (`#d9dfef`), rounded-md, `px-3 py-2 text-sm`; labels `text-sm font-medium` above, helper text `text-xs` Muted below.
- **Focus:** global `:focus-visible` — 2px solid Brand Blue outline, 2px offset. Caret is Brand Blue.
- **On the band:** transparent fill with On-Band Line border, white text (inline label editing).
- **Error:** message line in Destructive `text-sm`; inline conflicts (e.g. duplicate label) as adjacent text.

### Navigation
- **Shell:** white top bar, hairline bottom edge, `max-w-5xl` row: wordmark → nav links (`text-sm`; active semibold Ink, inactive Muted with hover) → account chip + quiet disconnect button (icon + text, text hidden on mobile).

### The Band (signature)
Full-bleed Brand-Blue gradient field flush under the top bar, `py-8` inner container. Carries the page's money moment: a Label-size On-Band Sub caption ("Portfolio value" / "Total value") over the Display-size USD figure, plus page identity (vault name, mono address + copy, network pill, back link). Loading renders a `h-10 w-56` pulse block in On-Band Line. One band per page; the connect page uses a compact centered variant with the wordmark.

### Value Chart (signature)
Inline SVG, `h-40 w-full`: 2px Brand Blue line over a vertical fade fill (Brand Blue at 14% → 0% opacity); deposit/withdraw events as 1.5px dashed vertical lines in Positive/Destructive; legend dots + "History since …" meta line in Label type below.

### Status & Freshness
- **Freshness indicator:** 8px dot (Positive when live) + `text-xs` Muted label ("Live" / "Reconnecting · updated 12s ago").
- **Warning callout:** rounded-md, Warning Border + Warning Surface + Warning text, `px-3 py-2`.
- **Skeletons:** `animate-pulse` blocks — Wash on white, On-Band Line on the band — shaped like the content they replace.
- **Errors:** centered Destructive `text-sm` message + outline "Retry" button; failures are always shown, never swallowed.

## Do's and Don'ts

### Do:
- **Do** give every page with a money moment exactly one band, and put the page's largest number there at 3rem+ semibold.
- **Do** draw structure with `#E4E8F4` hairlines — section rules and row separators — and keep primary data un-boxed on white.
- **Do** right-align numeric columns, keep tabular numerals, and set addresses/hashes/balances in Geist Mono truncated `6…4` with a copy affordance.
- **Do** ship every async surface with all four states: pulse skeleton, honest error + Retry, explanatory empty state, and data.
- **Do** use the muted semantic pair (`#1e7f4f` / `#c2402a`) strictly for money meaning, and the warning trio only in callout boxes.
- **Do** keep interactive states quiet: Wash hovers, `transition-colors`, 2px Brand Blue focus outline (white on the band).

### Don't:
- **Don't** introduce a second accent hue, gradients outside the band, glows, or dark surfaces — the world refuses crypto-casino styling.
- **Don't** set anything in Chillax except the lowercase "pecunity" wordmark.
- **Don't** box table or list content in shadowed cards; bordered containers are for forms, callouts, and empty states only.
- **Don't** use raw Tailwind palette utilities (`amber-*`, `gray-*`, `green-600`, `blue-100`…) — map to the named tokens (`positive`, `destructive`, `warning*`, `muted*`, `primary`). Remnants exist (see below) and are defects, not precedent.
- **Don't** put Ink text or the standard focus ring on the band — use the `on-band-*` palette and white outlines.

---

*Known not-yet-migrated remnants (open items, not system rules): raw `amber/gray/blue/green` utilities in `src/components/execution-history-table.tsx` (VaultEventBadge, line ~120), `src/components/execution-status-badge.tsx`, `src/components/freshness-indicator.tsx` (line ~27, `bg-amber-500`), `src/components/deposit-form.tsx` (`text-green-600`), and throughout `src/features/automation-editor/` (restyled only at heading level; inherits tokens otherwise).*
