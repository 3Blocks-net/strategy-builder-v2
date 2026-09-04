# Brand assets

The Pecunity logo, straight from the official brand kit at
<https://pecunity.io/branding>. Vendored so the UI never depends on a remote
host for its own mark, and so the files go through Vite's asset pipeline the
same way `../fonts/chillax-600.woff2` does.

**These files are the trademark itself. Never redraw, trace, recolor or
regenerate them — replace them only by re-downloading from the brand kit.**

## Files

| File | Brand kit name | Source URL (downloaded 2026-09-04) | Where it is used |
|---|---|---|---|
| `pecunity-logo-light.svg` | Logo Light | `/brand_assets/pecunity_logo_light.svg` | Header of both shells (white background) |
| `pecunity-logo-dark.svg` | Logo Dark | `/brand_assets/pecunity_logo_dark.svg` | Reserved for dark, non-brand-blue surfaces — not used yet |
| `pecunity-logo-mono-light.svg` | Mono Light | `/brand_assets/pecunity_logo_mono_light.svg` | Reserved (single-color on light) — not used yet |
| `pecunity-logo-mono-dark.svg` | Mono Dark | `/brand_assets/pecunity_logo_mono_dark.svg` | Sign-in door, on the Brand Blue band |
| `pecunity-symbol.svg` | Symbol | `/brand_assets/pecunity_symbol.svg` | Favicon (`index.html`) |
| `pecunity-favicon.ico` | — | `https://pecunity.io/favicon.ico` | Favicon fallback for browsers without SVG icon support |

All paths above are relative to `https://pecunity.io`. The `.zip` bundles the
brand kit page links to (`/branding/*.zip`) answered `404` on 2026-09-04; the
SVGs the page itself displays are the same assets and were used instead.

`pecunity-favicon.ico` is the brand owner's own rasterization of the symbol
(48×48, 32×32 and 16×16, taken from the Pecunity website). It is vendored rather than
generated so that no rasterization of ours ever ships — see the "no
modification" rule below.

## Usage rules (verbatim from the brand kit)

- Use the logo on clearly contrasting backgrounds (light logo on dark, dark
  logo on light).
- Maintain clear space around the logo: at least the height of the "P" on all
  sides.
- Use the symbol alone only when "Pecunity" is clearly visible elsewhere in the
  design.
- Do not stretch, rotate, recolor, or otherwise modify the logo.
- Do not place the logo on busy backgrounds or low-contrast surfaces.
- Do not use Pecunity branding in a way that implies endorsement or partnership
  without prior approval.

Note the naming convention: "Light"/"Dark" names the **background** the file is
made for, not the ink. `pecunity-logo-light.svg` carries a dark wordmark
(`#2b3150`) for light surfaces; `pecunity-logo-dark.svg` carries a light one
(`#f2f4fd`) for dark surfaces.

## Clear space, in numbers

The wordmark logos share the viewBox `0 0 900.19 196.4`. The "p" glyph inside
it spans y `56.83 … 179.97` — **123.14 units tall**, i.e. `123.14 / 196.4 =
0.627` of the full logo height.

So a logo rendered `h` pixels tall needs **≥ 0.627 × h** of empty space on every
side. Every call site keeps that margin by hand; there is no shared constant for
it, so check the arithmetic when you place the logo somewhere new.

## Licensing / usage rights

Pecunity is this project's own brand — the app being built here *is* Pecunity,
so it is the trademark owner's own use, not third-party use. The brand kit is
published publicly by the owner under the heading "Official assets for
referring to Pecunity in articles, integrations, and designs", with the usage
guidelines quoted above as the conditions. No separate license file, fee or
attribution requirement is attached; brand questions go to info@pecunity.io.

Unlike the Chillax font (ITF FFL, see `../fonts/README.md`), these files carry
no redistribution license of their own: they are trademark material. The
practical consequence for this repo is the same either way — **keep the files
byte-identical to the brand kit**. That is why no SVG here is minified,
optimized, re-exported or converted, and why the favicon is the owner's `.ico`
rather than one we rendered.
