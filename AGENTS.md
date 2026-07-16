# Chiefy Landing - AI Assistant Guidelines

## Project Overview
This repository (`chiefy-landing`) contains the marketing website for Chiefy (`https://chiefy.com`).
It is a static site built with **Astro** and **Tailwind CSS**, hosted on **Cloudflare Pages**.

**Primary Goal:** Achieve perfect or near-perfect PageSpeed/Lighthouse scores (SEO, LCP, CLS).
**Philosophy:** Zero-JavaScript by default.

## Design Guidelines

See `../DESIGN_SYSTEM.md` for comprehensive design guidelines including:
- Brand identity (colors, typography, design philosophy)
- UI patterns and components (buttons, layout, spacing)
- Editorial/blog styling (`.duet-prose` patterns)
- Glassmorphism, gradients, and visual effects
- Accessibility and performance standards

**Landing-specific constraints:**
- Zero-JavaScript by default (HTML/CSS first)
- Static images (AVIF/WebP) with explicit dimensions
- Simple static links to `app.chiefy.com`

## Tech Stack
- **Framework:** Astro (Static Site Generation)
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite`)
- **Interactivity:** React (used sparingly as "islands")
- **Package Manager:** pnpm

## Core Development Rules

### 1. Zero-JavaScript First
- **Default:** Do NOT use client-side JavaScript for UI interactions if HTML/CSS can achieve it.
- **Accordions/Menus:** Use `<details>` and `<summary>` tags.
- **Animations:** Use CSS keyframes and transitions. Respect `prefers-reduced-motion`.
- **Avoid:** Heavy libraries, scroll-jacking, or complex JS-based layout shifts.

### 2. React Usage Restrictions
React should only be used as a last resort for complex stateful logic.
- **Isolation:** Confine React to small, isolated "island" components.
- **Loading:** Always use `client:visible` (never `client:load` unless absolutely critical for above-the-fold content, which should be avoided).
- **Performance:** If a React component causes TBT (Total Blocking Time) or INP (Interaction to Next Paint) issues, it must be removed or refactored to vanilla JS/CSS.

### 3. Images & Media (LCP Strategy)
- **Hero/LCP:** Use static images (AVIF/WebP) for hero mockups. Avoid heavy React-based animations above the fold.
- **Attributes:** ALWAYS provide explicit `width` and `height` attributes to prevent CLS (Cumulative Layout Shift).
- **Preloading:** Preload critical LCP images for mobile.

### 4. Content Architecture
- **Blog:** Content lives in `src/content/blog/*.md`.
- **Legal Pages:** Legacy content lives in `src/snippets/legal/*.html` (migrated from Framer).
- **Data:** Static data (e.g., logos) lives in TypeScript files (e.g., `src/components/sections/logosData.ts`).

### 5. Links & CTAs
- **Destination:** CTAs are simple static links to `https://app.chiefy.com`.
- **No OAuth:** Do NOT implement Google OAuth popups or complex auth flows on this landing page. Keep it static.

## Internationalization and Marketing Copy

The root `../AGENTS.md` owns the required i18n reading list. Keep marketing claims consistent with Chrome Web Store and product copy; do not add localized landing-page support without a scoped locale/SEO plan.

## Directory Structure
- `src/layouts/`: Base HTML wrappers (SEO, global scripts).
- `src/pages/`: Astro routes (file-based routing).
- `src/components/`: Reusable UI components.
  - `sections/`: Large page sections (Hero, Features, Footer).
  - `ui/`: Small primitives (Button, Container).
- `src/content/`: Collections for blog posts.
- `public/`: Static assets (images, fonts).

## Code Writing Principles

**Astro/TypeScript:**
- Write minimal, performance-first code
- Prefer static generation over client-side rendering
- Use TypeScript for type safety in component props and data files

**Performance-Critical:**
- Zero-JavaScript by default (HTML/CSS first)
- Minimize bundle size (code-split, lazy load)
- Optimize for Core Web Vitals (LCP, CLS, INP)
- Test impact on Lighthouse scores before committing

- Follow accessibility standards (semantic HTML, ARIA)

## Verification
Before claiming a task is done:
1. **Build:** Run `pnpm build` to ensure static generation succeeds.
2. **Lint:** Run `pnpm lint` (if configured) or check for console errors.
3. **Performance:** Consider the impact of any added JS/CSS on Lighthouse scores.
