import { DEFAULT_LOCALE, NON_DEFAULT_LOCALES, SUPPORTED_LOCALES, type Locale } from "./locales"

export type RouteKind = "home" | "blogIndex" | "blogPost" | "vertical" | "legal"
export type LegalPage = "terms" | "privacy" | "cookies" | "disclaimer"
export type AlternateLink = { locale: Locale | "x-default"; href: string }

type RouteInput =
    | { kind: "home" }
    | { kind: "blogIndex" }
    | { kind: "blogPost"; slug: string }
    | { kind: "vertical"; slug: string }
    | { kind: "legal"; page: LegalPage }

export function localePrefix(locale: Locale): string {
    return locale === DEFAULT_LOCALE ? "" : `/${locale}`
}

export function localizedPath(locale: Locale, input: RouteInput): string {
    const prefix = localePrefix(locale)
    switch (input.kind) {
        case "home":
            return prefix || "/"
        case "blogIndex":
            return `${prefix}/blog`
        case "blogPost":
            return `${prefix}/blog/${input.slug}`
        case "vertical":
            return `${prefix}/for/${input.slug}`
        case "legal":
            return `${prefix}/${input.page}`
    }
}

export function localizedUrl(site: URL, locale: Locale, input: RouteInput): string {
    return new URL(localizedPath(locale, input), site).toString()
}

export function routeLocaleFromSegment(raw: string): Locale | null {
    if ((SUPPORTED_LOCALES as readonly string[]).includes(raw)) return raw as Locale
    return null
}

export function alternateLinks(
    site: URL,
    input: RouteInput,
    locales: readonly Locale[] = SUPPORTED_LOCALES,
): AlternateLink[] {
    const alternates = locales.map((locale) => ({
        locale,
        href: localizedUrl(site, locale, input),
    }))
    return [...alternates, { locale: "x-default", href: localizedUrl(site, DEFAULT_LOCALE, input) }]
}

export function englishOnlyAlternates(site: URL, input: RouteInput): AlternateLink[] {
    return alternateLinks(site, input, [DEFAULT_LOCALE])
}

export function getNonDefaultStaticLocalePaths() {
    return NON_DEFAULT_LOCALES.map((locale) => ({
        params: { locale },
        props: { locale },
    }))
}
