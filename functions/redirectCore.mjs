import localeSource from "./localeSource.generated.mjs"

export const LANDING_SECURITY_HEADERS = {
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
}

export const LANDING_HEADER_UNSETS = ["Access-Control-Allow-Origin", "Server"]

const SUPPORTED_LOCALES = new Set(localeSource.runtime_locales)
const DEFAULT_LOCALE = localeSource.default_locale
const ALIASES = localeSource.locale_aliases
const PSEUDO_VARIANTS = new Set(
    Object.values(localeSource.pseudo_locales ?? {}).flatMap(
        (pseudoLocale) => pseudoLocale.rejected_preference_variants ?? [],
    ),
)
const LEGAL_PAGES = new Set(["terms", "privacy", "cookies", "disclaimer"])
const SINGLETON_TAILS = new Set(localeSource.normalization.strip_singleton_tails_before_matching)

function assertSupportedNormalization() {
    const normalization = localeSource.normalization
    const expected = {
        convert_underscores_to_hyphens: true,
        lowercase_language_subtags: true,
        titlecase_script_subtags: true,
        uppercase_region_subtags: true,
        strip_singleton_tails_before_matching: ["u", "t", "x"],
        candidate_order: ["exact", "language-script", "base-language"],
        candidate_resolution_order: ["supported-locale", "explicit-alias"],
        default_after_all_candidates: "en",
        alias_applies_per_candidate_before_next_candidate: true,
        malformed_tags_ignored_before_base_fallback: true,
    }
    for (const [key, value] of Object.entries(expected)) {
        if (JSON.stringify(normalization[key]) !== JSON.stringify(value)) {
            throw new Error(`Unsupported locale normalization rule: ${key}`)
        }
    }
}

assertSupportedNormalization()

function withoutTrailingSlash(pathname) {
    return pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
}

function stripHtmlExtension(pathname) {
    return pathname.endsWith(".html") ? pathname.slice(0, -".html".length) || "/" : pathname
}

function canonicalizeHomepageIndex(pathname) {
    const parts = pathname.split("/").filter(Boolean)
    if (parts.at(-1) === "index") return parts.length === 1 ? "/" : `/${parts.slice(0, -1).join("/")}`
    return pathname
}

function isKnownHtmlRoute(pathname) {
    const parts = pathname.split("/").filter(Boolean)
    const offset = parts[0] && SUPPORTED_LOCALES.has(parts[0]) ? 1 : 0
    const first = parts[offset]
    if (!first) return true
    if (first === "blog") return parts.length >= offset + 1
    if (first === "for") return parts.length === offset + 2
    if (LEGAL_PAGES.has(first)) return parts.length === offset + 1
    return false
}

function isMalformedLocaleTag(raw) {
    if (!raw || raw.length > 64) return true
    if (raw.startsWith("-") || raw.endsWith("-") || raw.includes("--")) return true
    const parts = raw.split("-")
    if (!/^[A-Za-z]{2,3}$/.test(parts[0])) return true
    for (let index = 1; index < parts.length; index += 1) {
        const part = parts[index]
        if (part.length === 1 && SINGLETON_TAILS.has(part.toLowerCase())) continue
        if (!/^[A-Za-z0-9]{2,8}$/.test(part)) return true
        if (/^\d+$/.test(part) && part.length !== 3) return true
    }
    return false
}

function canonicalizeLocaleTag(raw) {
    const hyphenated = raw.replaceAll("_", "-")
    const lowerPseudo = hyphenated.toLowerCase()
    if ([...PSEUDO_VARIANTS].some((variant) => variant.replaceAll("_", "-").toLowerCase() === lowerPseudo)) {
        return { kind: "pseudo" }
    }
    if (isMalformedLocaleTag(hyphenated)) return { kind: "malformed" }

    const parts = hyphenated.split("-")
    const stripped = []
    for (const part of parts) {
        if (part.length === 1 && SINGLETON_TAILS.has(part.toLowerCase())) break
        stripped.push(part)
    }
    if (stripped.length === 0 || isMalformedLocaleTag(stripped.join("-"))) return { kind: "malformed" }

    const canonical = stripped.map((part, index) => {
        if (index === 0) return part.toLowerCase()
        if (/^[A-Za-z]{4}$/.test(part)) return `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`
        if (/^([A-Za-z]{2}|\d{3})$/.test(part)) return part.toUpperCase()
        return part.toLowerCase()
    })

    return { kind: "candidate", tag: canonical.join("-"), parts: canonical }
}

function resolveKnownRuntimeLocale(raw, options = {}) {
    const { allowLanguageFallbacks = true } = options
    const normalized = canonicalizeLocaleTag(raw)
    if (normalized.kind !== "candidate") return null

    const candidates = [normalized.tag]
    const [language, maybeScript] = normalized.parts
    if (allowLanguageFallbacks) {
        if (maybeScript && /^[A-Z][a-z]{3}$/.test(maybeScript)) candidates.push(`${language}-${maybeScript}`)
        candidates.push(language)
    }

    for (const candidate of [...new Set(candidates)]) {
        if (SUPPORTED_LOCALES.has(candidate)) return candidate
        if (ALIASES[candidate] && SUPPORTED_LOCALES.has(ALIASES[candidate])) return ALIASES[candidate]
    }
    return null
}

export function resolveRuntimeLocale(raw) {
    return resolveKnownRuntimeLocale(raw) ?? DEFAULT_LOCALE
}

function hasRegionOrScriptSubtag(parts) {
    const [, second] = parts
    return Boolean(second && (/^[A-Z][a-z]{3}$/.test(second) || /^([A-Z]{2}|\d{3})$/.test(second)))
}

function resolveRouteLocalePrefix(raw) {
    const exact = resolveKnownRuntimeLocale(raw, { allowLanguageFallbacks: false })
    if (exact) return exact

    const normalized = canonicalizeLocaleTag(raw)
    if (normalized.kind !== "candidate" || !hasRegionOrScriptSubtag(normalized.parts)) return null
    return resolveKnownRuntimeLocale(raw, { allowLanguageFallbacks: true })
}

function canonicalLocalePrefixedPath(pathname) {
    const parts = pathname.split("/")
    const first = parts[1]
    if (!first) return pathname
    const resolvedLocale = resolveRouteLocalePrefix(first)
    if (!resolvedLocale) return pathname

    const canonicalFirstSegment = SUPPORTED_LOCALES.has(first) ? first : null
    if (resolvedLocale === DEFAULT_LOCALE) {
        if (canonicalFirstSegment === DEFAULT_LOCALE || first !== resolvedLocale) {
            const rest = parts.slice(2).join("/")
            return rest ? `/${rest}` : "/"
        }
        return pathname
    }

    if (canonicalFirstSegment !== resolvedLocale) {
        return `/${resolvedLocale}${parts.slice(2).length ? `/${parts.slice(2).join("/")}` : ""}`
    }
    return pathname
}

export function computeCanonicalPathname(pathname) {
    let next = pathname
    for (let index = 0; index < 3; index += 1) {
        const before = next

        const localeCanonical = canonicalLocalePrefixedPath(next)
        if (localeCanonical !== next) next = localeCanonical

        let htmlCanonical = stripHtmlExtension(next)
        if (htmlCanonical !== next) htmlCanonical = canonicalizeHomepageIndex(htmlCanonical)
        if (htmlCanonical !== next && isKnownHtmlRoute(htmlCanonical)) next = htmlCanonical

        const indexCanonical = canonicalizeHomepageIndex(next)
        if (indexCanonical !== next && isKnownHtmlRoute(indexCanonical)) next = indexCanonical

        const slashCanonical = withoutTrailingSlash(next)
        if (slashCanonical !== next && isKnownHtmlRoute(slashCanonical)) next = slashCanonical

        if (next === before) break
    }
    return next
}

export function computeCanonicalRedirect(request) {
    const url = new URL(request.url)
    const pathname = computeCanonicalPathname(url.pathname)
    if (pathname === url.pathname) return null

    const target = new URL(request.url)
    target.pathname = pathname
    return target.toString()
}

const FLIP_REDIRECT_HOSTS = new Set(["duetmail.com", "www.duetmail.com"])

function isLegalPath(pathname) {
    const parts = pathname.split("/").filter(Boolean)
    const offset = parts[0] && SUPPORTED_LOCALES.has(parts[0]) ? 1 : 0
    // Exact legal route only (mirrors isKnownHtmlRoute): "/privacy" is legal,
    // "/privacy/foo" is NOT (must still flip). Length check prevents non-legal
    // subpaths from being wrongly exempted.
    return LEGAL_PAGES.has(parts[offset]) && parts.length === offset + 1
}

export function computeFlipRedirect(request, env) {
    const flag = env && env.FLIP_301
    if (flag !== true && flag !== "on" && flag !== "true") return null
    const url = new URL(request.url)
    if (!FLIP_REDIRECT_HOSTS.has(url.hostname)) return null
    const canonicalPath = computeCanonicalPathname(url.pathname)
    if (isLegalPath(canonicalPath)) return null
    return `https://chiefy.com${canonicalPath}${url.search}`
}

export function redirectResponse(location, status = 301) {
    return new Response(null, {
        status,
        headers: {
            Location: location,
            ...LANDING_SECURITY_HEADERS,
        },
    })
}

export function wrapResponseWithSecurityHeaders(response) {
    const headers = new Headers(response.headers)
    for (const [name, value] of Object.entries(LANDING_SECURITY_HEADERS)) {
        headers.set(name, value)
    }
    for (const name of LANDING_HEADER_UNSETS) {
        headers.delete(name)
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    })
}

export function computeWwwToApexRedirect(request) {
    const url = new URL(request.url)
    if (!url.hostname.startsWith("www.")) return null
    const target = new URL(request.url)
    target.hostname = url.hostname.slice(4)
    return target.toString()
}

export async function handleLandingRequest(request, env, next) {
    // Flip first: when FLIP_301 is on, www.duetmail.com is in FLIP_REDIRECT_HOSTS,
    // so it goes straight to chiefy.com in a single (canonicalized) hop. When flip
    // is off (dark default), this is null and www→apex handles host normalization.
    const flipLocation = computeFlipRedirect(request, env)
    if (flipLocation) return redirectResponse(flipLocation)
    const wwwLocation = computeWwwToApexRedirect(request)
    if (wwwLocation) return redirectResponse(wwwLocation)
    const redirectLocation = computeCanonicalRedirect(request)
    if (redirectLocation) return redirectResponse(redirectLocation)
    return wrapResponseWithSecurityHeaders(await next())
}
