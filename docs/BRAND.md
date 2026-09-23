# As Described: brand

One mark, one wordmark, one accent. The mark is a tilted price tag (rounded pentagon with an
eyelet hole) with a bold check knocked out of its body: every promise on the tag is checked.
It is a single evenodd path, so it needs no background and works in one colour.

## Files

| file | what | use |
|---|---|---|
| `public/brand/mark.svg` | the mark, 512 viewBox, accent fill + gold eyelet ring | any size ≥ 48 px |
| `public/brand/mark-mono.svg` | the mark in `currentColor`, no ring | tinted contexts, print, small sizes |
| `public/brand/wordmark.svg` | mark + "As Described" as outlines (Switzer 700), 2318×400 | dark backgrounds |
| `public/brand/logo-dark.png` | lockup on `#0B0E11`, 1024×320 | README, decks |
| `public/brand/mark-512.png`, `mark-256.png`, `mark-128.png` | the mark, transparent | avatars, app stores |
| `public/brand/x-header.png` | 1500×500 announcement header | X profile |
| `app/icon.svg` | the mark, 64 viewBox | browser tab (Next picks it up) |
| `app/favicon.ico` | 32×32, PNG payload | legacy favicon |
| `app/apple-icon.png` | 180×180, mark on dark, 20 px padding | iOS home screen |
| `app/opengraph-image.png` | 1200×630 | link previews (`og:image`, Next picks it up) |
| `components/brand/logo.tsx` | `LogoMark` (inline SVG, props `size`, `className`, `color`) and `Logo` (mark + wordmark text) | the site header and footer |
| `public/brand/GenLayer_*.svg` | GenLayer's own logos, unmodified | "Built on GenLayer" only |

The site mark (`LogoMark`) is the flat single-colour version without the gold ring: below
about 48 px the ring is under one pixel and only smudges.

## Colours

| token | hex | role |
|---|---|---|
| accent | `#19C6A6` | the mark, primary buttons, links |
| background | `#0B0E11` | page background, the dark plate behind every lockup |
| text | `#F2F4F6` | wordmark on dark |
| muted | `#98A2AE` | tagline, "Built on" |
| gold | `#F5B301` | the eyelet ring in `mark.svg`; promise pills on the site |

The mark is never set in the GenLayer gradient (`#110FFF → #9B6AF6 → #E37DF7`). That
gradient and the GenLayer logos belong to GenLayer and appear only in "Built on GenLayer".

## Type

Wordmark and tagline: **Switzer 700** (Fontshare). `wordmark.svg` carries the outlines so it
does not depend on the font being installed. In the site, `Logo` inherits the page font;
load Switzer in `globals.css` (`https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700&display=swap`).
Fallback for rasters: Inter, then the system sans.

## Minimum sizes

- Mark alone: 16 px (the tag silhouette and the check still read; the hole disappears, that is fine).
- Mark with the gold ring: 48 px.
- Lockup (mark + wordmark): 120 px wide.
- Keep clear space of at least a quarter of the mark's width on every side.

## Do

- Use the accent mark on dark, or the mono mark tinted to the text colour (`color="currentColor"`).
- Put the mark on `#0B0E11` or on white; both hold contrast.
- Pair "Built on GenLayer" with `GenLayer_Logo_White_Cropped.svg` on dark and
  `GenLayer_Logo_Black.svg` on light.

## Don't

- Never recolor, crop, outline, or restyle the GenLayer logos, and never put them inside our mark.
- Do not rotate the mark further, mirror it, or straighten it: the tilt is the mark.
- Do not add a gradient, shadow, or stroke to the mark.
- Do not set the wordmark in another weight or typeface.
- Do not place the mark on the accent colour itself.

## Rebuilding the rasters

The SVGs are the source. Rasters were rendered with headless Chrome (`--headless=new
--screenshot`, `--default-background-color=00000000` for transparent ones), resized with
`sips`, and the ICO wrapped with a 22-byte header around the 32 px PNG.
