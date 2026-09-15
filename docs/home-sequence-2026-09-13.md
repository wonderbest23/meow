# Homepage sequence follow-up

## Scope

Three selected adaptations from the stored Toss reference, not a reproduction of every reference section.

1. `HomeOpening` owns the existing hero and phone story. The desktop photo contracts while the same rendered phone emerges over its lower edge. The phone settles before the pinned story. Mobile retains its full-photo expansion without lifting the phone into the preceding copy.
2. `HomeWebsiteDemo` replaces the two static template thumbnails. The sequence shows the public fictional business brief, a rendered homepage draft, title editing, and the updated preview. It uses the product's `BrainwavePage` renderer and Korean template data, not a live customer project. Its contents are inert, and it does not call account, generation, payment, save, or publish endpoints.
3. `HomeBrandClosing` provides a full-width brand ending with a new illustrative first-day image. The existing conversation callback and business link remain intact. The AI image is identified as a brand illustration.

The existing PDF/PPT samples, product availability notices, business process section, FAQ, legal footer, chat and payment code are unchanged by this follow-up.

## Motion and accessibility

- Opening and website sequences use native scroll position, not timed playback.
- Reverse scrolling restores the same scene values.
- Website scene includes explicit reading holds before and after the title edit.
- A native range control supports pointer, arrow-key and Home/End navigation. Normal wheel/touch/navigation input returns to scroll control.
- Reduced motion uses a static completed website preview. Its range is disabled.
- Short viewports use an unpinned website layout; the range still allows scene inspection.
- Mobile editing pans the rendered page so that its title remains above the inspector.
- Mobile range placement leaves room for the floating support control.

## Verification

- Final TypeScript no-emit check and `git diff --check` passed after the keyboard and style fixes.
- `home-sequence-motion.test.ts`: bounds, continuous transitions, reading holds, reverse determinism, reduced-motion state, shared renderer, inert preview, no API calls or timers, preserved composition and image size.
- Existing `home-actions`, `home-polish`, `home-phone-motion`, and `home-copy-motion` tests passed.
- Browser inspection at 1440 x 900, 453 x 692 and 320 x 692: no document-level horizontal overflow in the inspected scenes.
- At 453 x 600, the website scene used its unpinned static completed layout without horizontal overflow.
- Desktop and mobile phone renderers reported WebGL; canvas raster samples were opaque and nonblank. Mobile phone and copy boxes did not overlap.
- Website and phone progress remained unchanged during idle checks. Website Home and End keys reached 0 and 100 after reload.
- Actual template heading inherits the correct 60px desktop font; mobile uses its native 27px / compact 24px title. Its rendered heading is above the editor inspector at 320px.
- New brand image loaded at its native 1672 x 941 dimensions; web asset is 198,580 bytes.
- Browser tools stalled during an intermediate hot reload. The agent-created test tab was replaced and the development server restarted; inspection then continued successfully.
- Final browser error-log inspection returned no errors. Temporary viewport overrides and agent-created test tabs were cleared.

## Release boundary

Local implementation only. No commit, push or production deployment was requested in this follow-up. No real AI generation, Google login, payment or publication flow was exercised. This does not change the verification status of production PPT generation.

## Phone mockup refinement

- Rebuilt the code-native Three.js body using iPhone 17 front proportions (71.5 x 149.6 mm, 1206 x 2622 display), based on https://www.apple.com/iphone-17/specs/. This is an illustrative model, not official Apple CAD or a licensed product render.
- Matched DOM display dimensions to the body, with evenly narrow bezels, rounded corners, a restrained light-blue aluminum edge, side controls and a smaller rotation. Removed the over-bright reflection from the black bezel.
- Kept the Dynamic Island, status bar and home indicator unaffected by the lifted-content fade. Message and conditions layers still share the phone's 3D transform.
- At 600-900px widths, copy and device now sit side by side. Narrow mobile keeps stacked content with more compact copy spacing. The frame calculation leaves room for both the progress control and support button.
- Browser checks at 1440 x 900, 642 x 692, 453 x 692 and 320 x 692: nonblank WebGL raster samples, no horizontal overflow, readable complete phone bounds and no copy/lifted-layer collision. The 642px display is approximately 485px tall; the 453px display is approximately 345px tall. Scroll-driven forward/reverse scenes and idle holds were checked.
- `home-phone-device.test.ts` covers physical aspect ratios, bezel consistency, responsive fit and minimum device size. Phone motion, homepage sequence, copy motion, action and polish tests passed, as did TypeScript and whitespace checks. Browser error logs were empty.
