# [ARCHIVED] Home Page Migration Plan (`/`)

> **Note:** This document is preserved for historical reference. The migration from Framer to Astro was successfully completed in January 2025.
> **Update (2025-07):** CTAs have been updated to dual-provider (Gmail + Outlook). The "Join Outlook waitlist" CTA is now "Start with Outlook" and both CTAs point to `/auth`.

Pseudocode / approach:
- Rebuild `https://duetmail.com/` as **static HTML** (Astro SSG) with **near‑zero JS**
- Keep only essential scripts: GTM + UTM capture + home JSON‑LD
- Recreate the Framer hero + above‑the‑fold layout first (LCP/CLS/TBT focus)
- Add the remaining sections second (logos/features/proof/pricing/FAQ/CTA/footer)

## Scope (Phase 1)

**In scope**
- Home page (`/`) only
- SEO essentials for home: title/description, canonical, OG/Twitter, structured data
- Performance hardening for home (PageSpeed)

**Out of scope (for now)**
- Blog (`/blog`, `/blog/:slug`)
- Legal pages (`/privacy`, etc.)
- Any CMS migration (Framer CMS → files/MDX/etc.)

## Baseline: Current Framer Home Page Structure

Framer home page (Desktop node) includes the following top‑level pieces (via Framer MCP `getNodeXml` on focused page):

**Hero**
- Background: `HeroBackgroundPremium` (variant `twilight`)
- Navigation: `NavigationNavbar` (fixed)
- Hero copy: `HeroSection` with props:
  - badge: `Join 20,000+ professionals`
  - headline: `Your chief of staff`
  - subtitle: `Save 4+ hours every week on email`
  - feature cycle: `sorting email`, `drafting replies`, `scheduling`, `finding answers`
  - CTAs:
    - Primary: `Start with Gmail` → `https://app.duetmail.com`
    - Secondary: `Join Outlook waitlist` → `https://app.duetmail.com/outlook-waitlist`

**Hero image**
- `InboxHeroMockup` inside a `SectionHeroImage` container

**Next sections (below fold)**
- Logos ticker + “Trusted by…” text
- Features section (header + feature cards)
- Social proof/testimonials
- Pricing
- FAQ
- Final CTA
- Footer

## Target Architecture (Astro + Tailwind)

Planned versions:
- `astro@5.16.6`
- `tailwindcss@4.1.18` + `@tailwindcss/vite@4.1.18`

### File / component layout

```
duet-landing/
  src/
    layouts/
      BaseLayout.astro
    pages/
      index.astro
    components/
      nav/
        Nav.astro
      sections/
        Hero.astro
        Logos.astro
        Features.astro
        Testimonials.astro
        Pricing.astro
        FAQ.astro
        FinalCTA.astro
        Footer.astro
      ui/
        Button.astro
        Container.astro
        Section.astro
```

### “No-JS by default” rules

- Prefer semantic HTML + Tailwind/CSS for 95% of interactions.
- Use `<details>` for accordions (FAQ) instead of JS.
- Use CSS keyframes for subtle motion (and respect `prefers-reduced-motion`).
- If React is used at all, it must be:
  - isolated to a single island component
  - loaded with `client:visible` (never `client:load`)
  - removed if it risks TBT/INP

## Home Page Components (Detailed)

### 1) `BaseLayout.astro` (SEO + scripts)

Responsibilities:
- Sets `<html lang="en-US">`
- Injects:
  - `<title>` + `<meta name="description">` (match current)
  - `<link rel="canonical">` for `/`
  - OG/Twitter tags (match current image + copy)
  - Icons (favicon + apple-touch-icon)
  - Home JSON‑LD (website + software application) from `framer/custom-code/pages/home/end_of_head_tag.html`
- Loads scripts:
  - GTM script (current container `GTM-MHRH38HP`)
  - UTM capture/persistence script (cookie `duet_utms`, localStorage `duet__utm_params`)
  - GTM `<noscript>` iframe right after `<body>`

Performance notes:
- Keep tracking scripts identical initially (to preserve attribution), then optimize GTM tag load order later if needed.
- Avoid additional third‑party scripts on the home page until Lighthouse is stable.

### 2) `Nav.astro` (top navigation)

Requirements:
- Fixed/sticky top bar (current behavior is fixed)
- Contains:
  - logo (SVG)
  - primary nav links (if any; can be anchor links for sections)
  - primary CTA (“Start with Gmail”) linking to `app.duetmail.com`
- Mobile:
  - use `<details>` + `summary` pattern for a no‑JS hamburger menu
  - ensure keyboard focus management is correct (native `<details>` helps)

Performance notes:
- Avoid loading icon libraries; inline SVGs.

### 3) `Hero.astro` (above the fold)

Structure (semantic):
- Badge (optional)
- `h1` with emphasized span for “chief of staff”
- Subtitle `p`
- Feature highlight:
  - Phase 1: render as a simple bullet list (fastest)
  - Phase 2: optional CSS-only “feature cycler” (no JS) using stacked spans and keyframes
- CTA row:
  - primary button (to app)
  - secondary button (Outlook waitlist)
- Small trust/terms line (“Free 14‑day trial”, etc.)

Visual background:
- Port `HeroBackgroundPremium` as a pure CSS background layer.
- Keep animations CSS-only and disable for `prefers-reduced-motion`.

### 4) `HeroMockup.astro` (LCP strategy)

Decision (recommended):
- Use a **static image** for the mockup for Phase 1 (best Lighthouse).

Implementation details:
- Use `<picture>` with `avif/webp/png` fallbacks.
- Provide explicit `width/height` to prevent CLS.
- Preload only the smallest hero image variant needed for mobile LCP.

Phase 2 (optional):
- Reintroduce subtle callouts or micro-animations in CSS.
- Avoid Framer Motion / React animation loops on initial load.

### 5) `Logos.astro`

Phase 1:
- Static grid of logos (no ticker) for performance.

Phase 2:
- CSS marquee with `prefers-reduced-motion` fallback to static.

### 6) `Features.astro`

Phase 1:
- One section header + 3–6 feature cards.
- Keep icons inline SVG.

Phase 2:
- Add the “bg glow” decorations as CSS gradients (no big images).

### 7) `Testimonials.astro`

Phase 1:
- Static 1–3 testimonials (no carousel).

Phase 2:
- Optional CSS scroll-snap carousel (no JS), or keep static.

### 8) `Pricing.astro`

Phase 1:
- Static cards only.

### 9) `FAQ.astro`

Use `<details>` accordions:
- Accessible by default
- No client JS

### 10) `FinalCTA.astro` + `Footer.astro`

- CTA repeats primary action (to app) and sets the last impression for conversion.
- Footer includes links for blog/legal (even if routes aren’t migrated yet).

## CTA Behavior (Keep It Simple)

Current behavior (and target for migration):
- CTAs are plain links to `https://app.duetmail.com/` (and related app routes).
- No Google OAuth popup/flow on the marketing site.

Rationale:
- Loading Google scripts and popup OAuth on the landing page is high risk for PageSpeed (extra JS + third-party cost).
- Attribution can be preserved via the existing UTM cookie (`Domain=.duetmail.com`) which is readable by the app.

If you want Chrome Web Store routing:
- We can port the “eligible for Chrome extension” detection logic later (and only on click).

## Performance Targets (Home)

Targets (mobile, realistic):
- LCP ≤ 2.0s
- CLS ≤ 0.05
- INP ≤ 200ms
- TBT ≤ 150ms
- Lighthouse Performance ≥ 90 (with GTM can be challenging; we’ll iterate)
- Lighthouse SEO ≥ 100

Budgets (initial render):
- JS shipped by us: ~0–10KB gzip (ideally zero)
- No JS animation loops above the fold
- One primary webfont family max for Phase 1 (or system fonts)

## Build Checklist (Phase 1)

1. Implement `BaseLayout.astro` + copy the 3 Framer snippets:
   - GTM + UTM script (head)
   - GTM noscript (body)
   - home JSON‑LD (head end)
2. Implement `Nav.astro`, `Hero.astro`, `HeroMockup.astro` with static image
3. Ensure:
   - `<h1>` exists and is unique
   - canonical is `https://duetmail.com/`
   - OG/Twitter tags match the current site
4. Run local Lighthouse and iterate on:
   - image sizing + preloading
   - font loading
   - removing any unnecessary JS
