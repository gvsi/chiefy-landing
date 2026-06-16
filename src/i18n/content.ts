import { getCollection, type CollectionEntry } from "astro:content"
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale, type RenderLocale } from "./locales"
import { alternateLinks, type AlternateLink, type LegalPage, type RouteInput } from "./routing"

type JsonObject = Record<string, unknown>
type JsonModule<T> = { default?: T }

export type HomeContent = JsonObject & { translationStatus?: "bootstrap-en" }
export type VerticalContent = JsonObject & { slug: string; translationStatus?: "bootstrap-en" }
export type TranslationState = "bootstrap" | "complete"
export type BlogPost = {
    entry: CollectionEntry<"blog">
    locale: Locale
    slug: string
    body: string
}

type TranslationRouteInput =
    | { kind: "home"; locale: Locale }
    | { kind: "blogIndex"; locale: Locale }
    | { kind: "blogPost"; locale: Locale; slug: string }
    | { kind: "vertical"; locale: Locale; slug: string }
    | { kind: "legal"; locale: Locale; page: LegalPage }

const routeAlternateLocaleCache = new Map<string, Promise<Locale[]>>()

const homeModules = import.meta.glob("./content/home/*.json", { eager: true })
const legalModules = import.meta.glob("./content/legal/*/*.html", {
    eager: true,
    query: "?raw",
    import: "default",
})
const verticalModules = import.meta.glob("./content/verticals/*/*.json", { eager: true })
const messageModules = import.meta.glob("./messages/*.json", { eager: true })

function readJsonModule<T>(modules: Record<string, unknown>, key: string, label: string): T {
    const module = modules[key] as JsonModule<T> | undefined
    if (!module?.default) {
        throw new Error(`Missing ${label}: ${key}`)
    }
    return module.default
}

function readRawModule(modules: Record<string, unknown>, key: string, label: string): string {
    const value = modules[key]
    if (typeof value !== "string") {
        throw new Error(`Missing ${label}: ${key}`)
    }
    return value
}

function basename(filePath: string): string {
    return filePath.split("/").pop()?.replace(/\.[^.]+$/u, "") ?? filePath
}

function hasBootstrapMarker(value: unknown): boolean {
    if (typeof value === "string") return value.includes("translationStatus: bootstrap-en")
    if (!value || typeof value !== "object") return false
    if ("translationStatus" in value && value.translationStatus === "bootstrap-en") return true
    return Object.values(value).some((entry) => hasBootstrapMarker(entry))
}

function entryToBlogPost(entry: CollectionEntry<"blog">): BlogPost {
    const [locale, ...slugParts] = entry.id.split("/")
    if (!locale || slugParts.length === 0) {
        throw new Error(`Invalid localized blog entry id: ${entry.id}`)
    }
    return {
        entry,
        locale: locale as Locale,
        slug: slugParts.join("/"),
        body: entry.body ?? "",
    }
}

function sortBlogPosts(posts: BlogPost[]): BlogPost[] {
    return posts.sort((a, b) => b.entry.data.publishedAt.getTime() - a.entry.data.publishedAt.getTime())
}

export function getHomeContent(locale: RenderLocale): HomeContent {
    return readJsonModule<HomeContent>(homeModules, `./content/home/${locale}.json`, "home content")
}

export function getLegalContent(locale: Locale, page: LegalPage): string {
    return readRawModule(legalModules, `./content/legal/${locale}/${page}.html`, "legal content")
}

export function getVerticalContent(locale: Locale, slug: string): VerticalContent {
    return readJsonModule<VerticalContent>(
        verticalModules,
        `./content/verticals/${locale}/${slug}.json`,
        "vertical content",
    )
}

export function getAllVerticalContent(locale: Locale): VerticalContent[] {
    const prefix = `./content/verticals/${locale}/`
    return Object.entries(verticalModules)
        .filter(([key]) => key.startsWith(prefix))
        .map(([key]) => {
            const content = readJsonModule<VerticalContent>(verticalModules, key, "vertical content")
            return { ...content, slug: basename(key) }
        })
        .sort((a, b) => a.slug.localeCompare(b.slug))
}

export async function getAllBlogPosts(locale: Locale): Promise<BlogPost[]> {
    const prefix = `${locale}/`
    const entries = await getCollection("blog", ({ id, data }) => id.startsWith(prefix) && !data.draft)
    return sortBlogPosts(entries.map(entryToBlogPost))
}

export async function getBlogPost(locale: Locale, slug: string): Promise<BlogPost | undefined> {
    const posts = await getAllBlogPosts(locale)
    return posts.find((post) => post.slug === slug)
}

export async function getRouteTranslationState(input: TranslationRouteInput): Promise<TranslationState> {
    if (input.locale === DEFAULT_LOCALE) return "complete"

    const messages = readJsonModule<JsonObject>(messageModules, `./messages/${input.locale}.json`, "messages")
    const consumed: unknown[] = [messages]

    switch (input.kind) {
        case "home":
            consumed.push(getHomeContent(input.locale))
            break
        case "blogIndex": {
            const posts = await getAllBlogPosts(input.locale)
            if (posts.length === 0) return "bootstrap"
            consumed.push(...posts.map((post) => post.entry.data))
            break
        }
        case "blogPost": {
            const post = await getBlogPost(input.locale, input.slug)
            if (!post) throw new Error(`Missing blog post for ${input.locale}/${input.slug}`)
            consumed.push(post.entry.data)
            break
        }
        case "vertical":
            consumed.push(getHomeContent(input.locale), getVerticalContent(input.locale, input.slug))
            break
        case "legal":
            consumed.push(getLegalContent(input.locale, input.page))
            break
    }

    return consumed.some((value) => hasBootstrapMarker(value)) ? "bootstrap" : "complete"
}

function routeCacheKey(input: RouteInput): string {
    switch (input.kind) {
        case "home":
        case "blogIndex":
            return input.kind
        case "blogPost":
        case "vertical":
            return `${input.kind}:${input.slug}`
        case "legal":
            return `${input.kind}:${input.page}`
        default:
            // Help routes use englishOnlyAlternates(); they never go through the
            // locale translation-state machinery (no help case in getRouteTranslationState).
            throw new Error(`Unsupported route kind for translation-state caching: ${input.kind}`)
    }
}

function translationRouteInput(input: RouteInput, locale: Locale): TranslationRouteInput {
    switch (input.kind) {
        case "home":
        case "blogIndex":
            return { kind: input.kind, locale }
        case "blogPost":
            return { kind: "blogPost", locale, slug: input.slug }
        case "vertical":
            return { kind: "vertical", locale, slug: input.slug }
        case "legal":
            return { kind: "legal", locale, page: input.page }
        default:
            // Help routes use englishOnlyAlternates(); they never go through the
            // locale translation-state machinery (no help case in getRouteTranslationState).
            throw new Error(`Unsupported route kind for translation-state input: ${input.kind}`)
    }
}

async function getCompleteLocalesForRoute(input: RouteInput): Promise<Locale[]> {
    const key = routeCacheKey(input)
    const cached = routeAlternateLocaleCache.get(key)
    if (cached) return cached

    const locales = Promise.all(
        SUPPORTED_LOCALES.map(async (locale) => ({
            locale,
            state: await getRouteTranslationState(translationRouteInput(input, locale)),
        })),
    ).then((states) =>
        states
            .filter(({ state }) => state === "complete")
            .map(({ locale }) => locale),
    )
    routeAlternateLocaleCache.set(key, locales)
    return locales
}

export async function getAlternateLinksForRoute(site: URL | undefined, input: RouteInput): Promise<AlternateLink[]> {
    return alternateLinks(site, input, await getCompleteLocalesForRoute(input))
}

export function robotsForTranslationState(state: TranslationState): string | undefined {
    return state === "bootstrap" ? "noindex,noarchive" : undefined
}
