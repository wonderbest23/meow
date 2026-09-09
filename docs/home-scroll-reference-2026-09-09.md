# Homepage Scroll Review

## Reference Capture

Reference: https://toss.im/ (not Toss Payments).

The live page was loaded in Chrome and scrolled to the footer. This was not a full-page screenshot reconstructed into a video. Chrome screencast frames were recorded while real wheel input (desktop) and touch start/move/end input (mobile emulation) advanced the page. Viewport checkpoints and scroll positions were saved alongside each recording.

| Capture | Viewport | Recorded browser frames | Checkpoints | Footer reached |
| --- | --- | --- | --- | --- |
| Desktop | 1440 x 900 | 4,371 | 155 | Yes |
| Mobile emulation | 390 x 844 | 3,772 | 69 | Yes |

Local reference artifacts (excluded from deployment):

- `artifacts/toss-reference/desktop-full-scroll.mp4`
- `artifacts/toss-reference/mobile-full-scroll.mp4`
- `artifacts/toss-reference/{desktop,mobile}/observations.json`

## Observed Structure

- Desktop 000-014: large lifestyle video expands, its title leaves, then the video contracts while a phone visual carries the narrative into the next section.
- Desktop 020: product visual and concise feature text occupy separate columns. The product UI changes with the feature being described.
- Desktop 028: three dark, moving feature panels sit side by side. Each has its own destination arrow.
- Desktop 040-116: full-bleed media alternates with white product explanation sections, rather than repeating identical cards.
- Desktop 130-154: portrait media, large concluding imagery, and a complete legal footer finish the page.
- Mobile 000-007: a portrait hero is followed by independently stacked product images and descriptions. The desktop pinned layout is not merely scaled down.
- Mobile 018: the dark investment feature is a single vertical module with its description below it.
- Mobile 025: shopping uses one product image, a short heading, and a short description. Later modules continue vertically to the footer (068).

## Adaptation For Oneulstart

1. Use the two user-supplied images as original brand assets. Preserve the visible conversation entry and its send affordance.
2. Use native, continuous scroll progress for desktop product transitions. Avoid discrete scene-index snapping and overlapping text crossfades.
3. Use normal vertical sections on mobile and reduced-motion devices. Do not force a desktop pinned experience into a small screen.
4. Present the three existing destinations as a dark product band: sample PDF, sample PPT, and business workspace. Keep real links and honest scope descriptions.
5. Use the founder collage as brand imagery, explicitly not customer testimonials.
6. Keep the actual business planning, paid document generation, document editing, account, and payment behavior unchanged.

The supplied photographs remain static images with scroll transforms, not newly generated live-action footage. The existing PDF cover is an actual sample; the presentation and workspace illustrations are labelled composition examples. Toss logos, media, financial claims, and customer counts are not included in the application.

## Verification

- Browser checks: 320, 390, 768 and 1440px widths, including compact desktop height.
- Continuous forward/reverse progress, mobile layout, reduced motion and static animation fallback.
- Image loads, no horizontal overflow, sample links, consultation draft, send affordance and route transition.
- Separate full-scroll recordings of the implemented homepage under `artifacts/oneulstart-cinematic/`.

The application itself requires JavaScript hydration; the static fallback check refers to scroll-animation failure or disablement, not full application support without JavaScript.
