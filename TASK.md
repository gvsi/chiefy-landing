# Task: Build Sub-Vertical Landing Pages

## Overview

Build sub-vertical landing pages for cold outreach campaigns. Each page is a personalized variant of the existing homepage (`src/pages/index.astro`) that shows Duet Mail's features in the context of a specific industry — fishing charters, wedding planners, custom jewelers, etc.

**Route pattern:** `duetmail.com/for/[slug]` (e.g. `duetmail.com/for/fishing-charters`)

**Data-driven:** Each page loads a JSON file from `src/data/verticals/[slug].json` and passes the data as props to modified versions of the existing showcase components.

**Static generation:** All pages are statically generated at build time via `getStaticPaths()`. No runtime rendering.

---

## Critical Constraints

1. **DO NOT modify `src/pages/index.astro`** — the homepage must remain exactly as-is
2. **Components must be backwards-compatible** — when no props are passed, they render their current hardcoded content (the homepage still works)
3. **Match the existing design system** — use the same CSS variables (`--mockup-window-bg`, `--mockup-border`, `--duet-muted`, `--prose-heading`, etc.), same font families (`var(--font-serif)` = Domine, `var(--font-sans)` = Manrope), same animation patterns (intersection observer → `.in-view` class)
4. **Build config:** `output: "static"`, `trailingSlash: "never"`, `build.format: "file"` — see `astro.config.mjs`
5. **Package manager:** pnpm

---

## Project Structure

```
src/
  pages/
    index.astro                         ← Homepage (DO NOT MODIFY)
    for/
      [slug].astro                      ← Vertical landing page template
  components/
    nav/Nav.astro
    sections/
      Hero.astro                        ← Rotating headline OR static vertical headline
      HeroBackground.astro
      InboxHeroMockup.astro             ← Dynamic inbox mockup
      MathSection.astro                 ← ROI math card (vertical pages only)
      Logos.astro                       ← Logo ticker (homepage only)
      ShowcaseContainer.astro
      CategorizationShowcase.astro      ← Dynamic emails + personalized subtitle
      DraftShowcase.astro               ← Dynamic compose window + personalized subtitle
      AgentChatShowcase.astro           ← Dynamic chat + personalized subtitle
      Testimonials.astro                ← Default OR vertical-specific testimonials
      Pricing.astro                     ← 3-tier pricing + optional vertical note
      FAQ.astro                         ← Base FAQs + optional vertical FAQs
      FinalCTA.astro                    ← Default OR vertical-specific CTA
      Footer.astro
    ui/
      TestimonialCard.astro
  layouts/
    BaseLayout.astro
  data/
    verticals/
      fishing-charters.json             ← Reference implementation
  utils/
    constants.ts                        ← APP_URL, SUPPORT_MAILTO, etc.
```

### Vertical page composition (`for/[slug].astro`)

Identical to `index.astro` EXCEPT:
- `Logos` replaced by `MathSection`
- Outlook waitlist CTA hidden (only shows on homepage)
- All components receive vertical data props

```astro
<BaseLayout title={data.pageTitle} description={data.metaDescription} canonicalPath={`/for/${data.slug}`}>
  <Nav />
  <main>
    <HeroBackground />
    <Hero heroHeadline={...} heroSubline={...} heroBadge={...}>
      <InboxHeroMockup inboxEmails={...} autodraft={...} />
    </Hero>
    <MathSection pricePerBooking={...} bookingUnit={...} lostPerMonth={...} monthlyLoss={...} punchline={...} />
    <ShowcaseContainer>
      <CategorizationShowcase categorizationEmails={...} categorizationSubtitle={...} />
      <DraftShowcase draft={...} draftSubtitle={...} />
      <AgentChatShowcase agent={...} agentSubtitle={...} />
    </ShowcaseContainer>
    <Testimonials verticalTestimonials={...} testimonialsTitle={...} />
    <Pricing pricingNote={...} />
    <FAQ verticalFaqs={...} />
  </main>
  <FinalCTA ctaHeadline={...} ctaSubline={...} />
  <Footer />
</BaseLayout>
```

---

## Component Props Reference

All props are optional. When absent, components render their homepage defaults.

### `Hero.astro`
| Prop | Type | Effect |
|------|------|--------|
| `heroBadge` | `string` | Replaces "Now available for Gmail" pill text |
| `heroHeadline` | `string` | Static `<h1>` instead of rotating "chief of staff for..." |
| `heroSubline` | `string` | Replaces "Save 4+ hours every week on email" |

When `heroHeadline` is set, the Outlook waitlist CTA is hidden (only "Start with Gmail" shows).

### `InboxHeroMockup.astro`
| Prop | Type | Effect |
|------|------|--------|
| `inboxEmails` | `InboxEmail[]` | Replaces hardcoded Alex Rivera/Emma Park/etc. emails |
| `autodraft` | `string` | Autodraft text shown on the first email |

`InboxEmail`: `{ from, avatarLetter, avatarColor, subject, preview?, pill, pillColor }`
- Avatar colors: `pink`, `blue`, `purple`, `lavender`
- Pill colors: `red`, `blue`, `amber`, `lavender`

### `MathSection.astro` (vertical pages only)
| Prop | Type | Effect |
|------|------|--------|
| `pricePerBooking` | `string` | e.g. "$500" |
| `bookingUnit` | `string` | e.g. "charter" |
| `lostPerMonth` | `string` | e.g. "4" |
| `monthlyLoss` | `string` | e.g. "$2,000" |
| `punchline` | `string` | Italic closing line |

Glassmorphic card with gradient border, red loss amount, "vs" divider, Duet $30/mo price.

### `CategorizationShowcase.astro`
| Prop | Type | Effect |
|------|------|--------|
| `categorizationEmails` | `CatEmail[]` | Replaces hardcoded emails |
| `categorizationSubtitle` | `string` | Replaces default subtitle (title stays "Duet organizes your inbox") |

### `DraftShowcase.astro`
| Prop | Type | Effect |
|------|------|--------|
| `draft` | `DraftData` | Replaces hardcoded compose window |
| `draftSubtitle` | `string` | Replaces default subtitle (title stays "Duet drafts in your voice") |

`DraftData`: `{ to, subject, originalFrom, originalText, lines[], highlightText, tooltipFeatures[] }`

### `AgentChatShowcase.astro`
| Prop | Type | Effect |
|------|------|--------|
| `agent` | `AgentData` | Replaces hardcoded chat conversation |
| `agentSubtitle` | `string` | Replaces default subtitle (title stays "Ask anything about your email") |

`AgentData`: `{ userMessage, agentResponse, followUp?, followUpResponse? }`

### `Testimonials.astro`
| Prop | Type | Effect |
|------|------|--------|
| `verticalTestimonials` | `VerticalTestimonial[]` | Replaces all 5 default testimonials |
| `testimonialsTitle` | `string` | Replaces "Loved by busy professionals" |

`VerticalTestimonial`: `{ name, title, quote, avatarKey? }`

Available `avatarKey` values (reuse existing avatar images):
- Male: `michael`, `johnny`
- Female: `francesca`, `jennifer`, `sarah`

When no `avatarKey`, shows initial letter fallback. Match avatar gender to testimonial name.

When `verticalTestimonials` is set, no company logos render (logos only appear on homepage testimonials).

### `Pricing.astro`
| Prop | Type | Effect |
|------|------|--------|
| `pricingNote` | `string` | Annotation line below pricing cards |

### `FAQ.astro`
| Prop | Type | Effect |
|------|------|--------|
| `verticalFaqs` | `FAQItem[]` | Appended after the 5 base FAQs |

`FAQItem`: `{ question, answer }`

### `FinalCTA.astro`
| Prop | Type | Effect |
|------|------|--------|
| `ctaHeadline` | `string` | Replaces "Get 4 hours back. Every week." (supports `\n` for line breaks) |
| `ctaSubline` | `string` | Replaces default subtitle |

---

## JSON Schema

```typescript
interface VerticalPageData {
  // SEO & routing
  slug: string;
  pageTitle: string;
  metaDescription: string;

  // Hero
  heroBadge: string;              // pill text, e.g. "Trusted by 500+ charter captains"
  heroHeadline: string;
  heroSubline: string;

  // Inbox mockup
  inboxEmails: InboxEmail[];      // 4 items
  autodraft: string;

  // ROI math card
  math: {
    pricePerBooking: string;
    bookingUnit: string;
    lostPerMonth: string;
    monthlyLoss: string;
    punchline: string;
  };

  // Showcase subtitles (titles stay generic)
  categorizationSubtitle: string;
  draftSubtitle: string;
  agentSubtitle: string;

  // Showcase mockup data
  categorizationEmails: CatEmail[];  // 5 items
  draft: DraftData;
  agent: AgentData;

  // Testimonials
  testimonialsTitle: string;         // e.g. "Loved by charter captains"
  testimonials: VerticalTestimonial[]; // 5 items with avatarKey

  // Pricing, FAQ, CTA
  pricingNote: string;
  verticalFaqs: FAQItem[];           // 2-3 items, appended to base FAQs
  ctaHeadline: string;               // supports \n for line breaks
  ctaSubline: string;
}
```

See `src/data/verticals/fishing-charters.json` for the complete reference implementation.

---

## Writing Guidelines for New Verticals

### Hero
- **Badge**: Social proof format — "Trusted by N+ [role plural]"
- **Headline**: Clear value prop, not just a pain point. Say what Duet IS for them.
- **Subline**: Mention that Duet *learns* their specifics. Keep it to 1-2 sentences.

### Showcase subtitles
- Titles stay generic ("Duet organizes your inbox", "Duet drafts in your voice", "Ask anything about your email")
- Subtitles should be specific to the vertical's workflow and pain points

### Testimonials
- 5 testimonials, industry-specific roles and scenarios
- Match `avatarKey` genders: 2 male (`michael`, `johnny`) + 3 female (`francesca`, `jennifer`, `sarah`)
- Quotes should reference specific pain points the vertical faces

### CTA
- Headline: emotional, industry-specific closer (supports line breaks with `\n`)
- Subline: short, action-oriented

---

## Files Modified (from homepage baseline)

**Created:**
- `src/pages/for/[slug].astro`
- `src/components/sections/MathSection.astro`

**Modified (backwards-compatible optional props):**
- `src/components/sections/Hero.astro` — `heroBadge`, `heroHeadline`, `heroSubline` + hides Outlook CTA
- `src/components/sections/InboxHeroMockup.astro` — `inboxEmails`, `autodraft`
- `src/components/sections/CategorizationShowcase.astro` — `categorizationEmails`, `categorizationSubtitle`
- `src/components/sections/DraftShowcase.astro` — `draft`, `draftSubtitle`
- `src/components/sections/AgentChatShowcase.astro` — `agent`, `agentSubtitle`
- `src/components/sections/Testimonials.astro` — `verticalTestimonials`, `testimonialsTitle`
- `src/components/sections/Pricing.astro` — `pricingNote`
- `src/components/sections/FAQ.astro` — `verticalFaqs`
- `src/components/sections/FinalCTA.astro` — `ctaHeadline`, `ctaSubline`

**Not modified:**
- `src/pages/index.astro`
- `astro.config.mjs`
- `Logos.astro` (used on homepage, not on verticals)
- Global styles / CSS variables

---

## Testing

1. `pnpm build` — verify static generation completes without errors
2. `pnpm dev` — verify homepage still renders identically (no regressions)
3. Visit `localhost:4321/for/fishing-charters` — verify all personalized content renders
4. Check mobile responsive (mockups have breakpoints at 809px, 639px)
5. Check both light and dark themes (`html[data-theme="light"]`)
6. Verify all animations still work (intersection observer → `.in-view` transitions)
7. Check `dist/for/fishing-charters.html` exists in build output
