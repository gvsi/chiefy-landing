// src/utils/brand.ts
//
// Build-time, host-aware brand helper. The chiefy-landing Pages build serves
// Chiefy-branded parity content from the SAME source tree by setting env vars at
// build time, instead of forking the content (the old `feat: chiefy landing
// parity rebrand` fork, which was reverted). This module is the single place that
// reads those env vars so canonical URL, og:site_name, JSON-LD brand names, and
// the consent-banner brand all resolve from one source.
//
// Env (set by the chiefy Pages build; all optional — defaults keep Duet Mail):
//   SITE_URL          e.g. https://chiefy.com   (default https://duetmail.com)
//   SITE_BRAND        e.g. Chiefy               (default Duet Mail)
//   SITE_PRODUCT_NAME the product name in JSON-LD softwareName / og — defaults to
//                     SITE_BRAND so a single var flips both.
//
// These are read via import.meta.env (Vite/Astro) with a process.env fallback so
// the same helper works from astro.config.mjs (Node, no import.meta.env) too.

const DEFAULT_SITE_URL = "https://duetmail.com";
const DEFAULT_SITE_BRAND = "Duet Mail";
const DEFAULT_SITE_TWITTER = "@DuetMailApp";

function readEnv(key: string): string | undefined {
    // Astro/Vite exposes build env on import.meta.env; astro.config.mjs runs in
    // plain Node where only process.env exists. Support both.
    const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const fromMeta = metaEnv?.[key];
    if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
    const fromProcess = typeof process !== "undefined" ? process.env?.[key] : undefined;
    if (typeof fromProcess === "string" && fromProcess.trim()) return fromProcess.trim();
    return undefined;
}

/** Canonical site origin. chiefy build sets SITE_URL=https://chiefy.com. */
export const SITE_URL: string = readEnv("SITE_URL") ?? DEFAULT_SITE_URL;

/** Display brand for og:site_name + consent banner. chiefy build sets SITE_BRAND=Chiefy. */
export const SITE_BRAND: string = readEnv("SITE_BRAND") ?? DEFAULT_SITE_BRAND;

/** Product name for JSON-LD. Defaults to SITE_BRAND so one var flips both. */
export const SITE_PRODUCT_NAME: string = readEnv("SITE_PRODUCT_NAME") ?? SITE_BRAND;

/** Twitter/X handle for twitter:site/creator. chiefy build sets SITE_TWITTER (or leaves the default). */
export const SITE_TWITTER: string = readEnv("SITE_TWITTER") ?? DEFAULT_SITE_TWITTER;

/**
 * Interpolate the host-aware brand + privacy href into the English-only consent
 * banner snippet. Kept here (not inline in BaseLayout.astro) so the uppercase
 * brand identifiers don't trip the i18n source scanner, and so the placeholder
 * contract has one owner.
 */
export function renderConsentBanner(rawHtml: string): string {
    return rawHtml
        .split("__SITE_BRAND__").join(SITE_BRAND)
        .split("__PRIVACY_HREF__").join(`${SITE_URL}/privacy`);
}

/**
 * Host-aware home JSON-LD brand names (B3). The exact-brand entity names
 * (websiteName / organizationName / softwareName) come from the localized
 * `src/i18n/content/home/<locale>.json` `jsonLd.*` keys (all "Duet Mail"); we
 * override them with the build env so the chiefy build reports Chiefy WITHOUT
 * editing the 48 locale content files. SCOPE: home page only, and only the three
 * exact-brand names — descriptive fields (websiteAlternateName, softwareDescription)
 * keep their content text and are out of scope here.
 */
export const jsonLdBrand = {
    websiteName: SITE_BRAND,
    organizationName: SITE_BRAND,
    softwareName: SITE_PRODUCT_NAME,
} as const;
