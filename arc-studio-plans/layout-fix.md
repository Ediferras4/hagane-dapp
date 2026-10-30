## Implementation Plan: Hagane responsive layout fix

### Summary
The logic works, but the layout has three problems: the header scrolls away, the two-column grid only starts at 1024px (not 900px), and the "Your tokens" header puts the description beside two buttons, which squeezes the text in a narrow card (the preview panel is narrow). This is a CSS-only pass in Tailwind. No logic, hooks, or contract files change.

### Architecture
- Breakpoint: set theme.screens explicitly in tailwind.config.js with a desk screen at 900px: sm 640, md 768, desk 900, lg 1024, xl 1280, 2xl 1536. Defining the full list keeps CSS order correct.
- Container: one shared width of max-w-[1080px] mx-auto px-4 sm:px-8 for the header and main content (was max-w-6xl, 1152px).
- Header: fixed inset-x-0 top-0 z-30 with a bottom hairline and bg-sumi/70 backdrop-blur-md. Inner bar h-16 sm:h-[72px]. The page gets pt-16 sm:pt-[72px] so nothing hides under it. z-order stays below the confirmation dialog (z-40) and the wrong-network pause (z-50). On phones the brand shrinks and the kanji tagline hides on the narrowest screens; the network pill stays hidden below sm.
- Grid: grid grid-cols-1 items-start gap-6 desk:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] desk:gap-8. One column at 100% width on mobile. items-start is required, otherwise the grid stretches the Review panel and it can never stick. Review and Result panels use desk:sticky desk:top-24 (below the fixed header) instead of lg:sticky lg:top-6.
- Token list header: a wrapping row (flex flex-wrap items-start justify-between gap-x-4 gap-y-3). The title and description sit in a block with min-w-0 flex-1 basis-60 so the text always has room. The 0/10 counter, Clear selection, and Suggest sit in one action group that stays on one line on desktop and wraps under the title on phones.
- Token rows: name, balance, value, and address lines can wrap instead of truncating into a sliver. The orange reason line (dot, reason, detail) wraps so the long "pool holds $135.5000, under $1,000" text no longer squeezes the name. The amount input and Max wrap to their own line when space is tight and right-align. Comfortable vertical padding, tap targets stay at least 44px.
- Hero and spacing: reduced top padding to sit under the fixed header (pt-10 sm:pt-16). The decorative kanji stays clipped, so there is no horizontal scroll.

### Files to Create/Modify
1. tailwind.config.js: explicit screens with desk: 900px.
2. src/components/Header.tsx: fixed, translucent, blurred bar inside the 1080px container, with mobile-friendly sizing.
3. src/App.tsx: container max-w-[1080px], top offset for the fixed header, new grid classes, tighter hero.
4. src/components/TokenList.tsx: wrapping header and action group, roomier and wrapping row content.
5. src/components/ReviewPanel.tsx: sticky classes on the desk breakpoint, offset below the header.
6. src/components/ResultPanel.tsx: same sticky classes.

### Build Sequence
1. Set the screens in tailwind.config.js.
2. Rebuild the header, then add the container and top offset in App.tsx.
3. Switch to the grid with items-start and the sticky panels.
4. Fix the Tokens header and rows.
5. Check at roughly 360px, 700px (the narrow preview), 900px, and 1440px for horizontal scroll, clipped text, or content hiding under the header.
6. Run the project checks and confirm the dev server serves every changed file (and that only one dev server is running).

### Done When
- [ ] The header stays fixed while the page scrolls, with a blurred translucent background and no content hidden under it.
- [ ] One column below 900px; token list left and Review right at 900px and above. Review stays in view while the list scrolls.
- [ ] Content is centered and capped at 1080px on wide screens.
- [ ] "Your tokens", Clear selection, and Suggest are aligned and wrap cleanly on phones.
- [ ] Token names, values, reasons, and addresses are readable at 360px with no horizontal scroll.
- [ ] Lint and typecheck pass and behavior is unchanged: selection, eligibility, confirmation, and the result screen work as before.

## Ready to build?
