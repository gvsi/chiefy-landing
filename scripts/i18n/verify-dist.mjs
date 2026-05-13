#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import * as parse5 from "parse5"

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
const distRoot = path.join(repoRoot, "dist")
const localeSource = JSON.parse(readFileSync(path.join(repoRoot, "src/i18n/locales.source.json"), "utf8"))
const defaultLocale = localeSource.default_locale
const nonDefaultLocales = localeSource.runtime_locales.filter((locale) => locale !== defaultLocale)

function fail(message) {
    throw new Error(message)
}

function read(relativePath) {
    return readFileSync(path.join(repoRoot, relativePath), "utf8")
}

function readDist(relativePath) {
    return readFileSync(path.join(distRoot, relativePath), "utf8")
}

function normalizeWhitespace(value) {
    return value.replace(/\s+/gu, " ").trim()
}

function assertCopiedRoutesManifest() {
    const source = read("public/_routes.json")
    const targetPath = path.join(distRoot, "_routes.json")
    if (!existsSync(targetPath)) fail("dist/_routes.json is missing")
    const target = readFileSync(targetPath, "utf8")
    if (source.trim() !== target.trim()) fail("dist/_routes.json drifted from public/_routes.json")
}

function listFiles(dir, suffix, out = []) {
    if (!existsSync(dir)) return out
    for (const entry of readdirSync(dir)) {
        const absolutePath = path.join(dir, entry)
        const stat = statSync(absolutePath)
        if (stat.isDirectory()) listFiles(absolutePath, suffix, out)
        else if (absolutePath.endsWith(suffix)) out.push(absolutePath)
    }
    return out
}

function getAttr(node, name) {
    return node.attrs?.find((attr) => attr.name === name)?.value
}

function textContent(node) {
    if (node.nodeName === "#text") return node.value ?? ""
    return (node.childNodes ?? []).map(textContent).join("")
}

function visit(node, visitor) {
    visitor(node)
    for (const child of node.childNodes ?? []) visit(child, visitor)
}

function parseHtmlFile(relativePath) {
    const html = readDist(relativePath)
    const document = parse5.parse(html)
    return { html, document }
}

function collectElements(document, tagName) {
    const elements = []
    visit(document, (node) => {
        if (node.tagName === tagName) elements.push(node)
    })
    return elements
}

function collectJsonLd(relativePath) {
    const { document } = parseHtmlFile(relativePath)
    return collectElements(document, "script")
        .filter((node) => getAttr(node, "type") === "application/ld+json")
        .map((node) => {
            try {
                return JSON.parse(textContent(node))
            } catch (error) {
                fail(`Invalid JSON-LD in dist/${relativePath}: ${error.message}`)
            }
        })
}

function jsonLdTypes(value, out = []) {
    if (Array.isArray(value)) {
        value.forEach((item) => jsonLdTypes(item, out))
    } else if (value && typeof value === "object") {
        if (value["@type"]) out.push(value["@type"])
        for (const child of Object.values(value)) jsonLdTypes(child, out)
    }
    return out
}

function assertJsonLd(relativePath, requiredTypes) {
    const blocks = collectJsonLd(relativePath)
    if (blocks.length === 0) fail(`Missing JSON-LD in dist/${relativePath}`)
    const types = new Set(blocks.flatMap((block) => jsonLdTypes(block)))
    for (const required of requiredTypes) {
        if (Array.isArray(required)) {
            if (!required.some((type) => types.has(type))) {
                fail(`Missing JSON-LD type ${required.join(" or ")} in dist/${relativePath}`)
            }
        } else if (!types.has(required)) {
            fail(`Missing JSON-LD type ${required} in dist/${relativePath}`)
        }
    }
    for (const block of blocks) {
        if (!hasInLanguage(block)) fail(`JSON-LD block missing inLanguage in dist/${relativePath}`)
    }
}

function hasInLanguage(value) {
    if (Array.isArray(value)) return value.some(hasInLanguage)
    if (!value || typeof value !== "object") return false
    if (typeof value.inLanguage === "string") return true
    return Object.values(value).some(hasInLanguage)
}

function assertEnglishRouteJsonLdMatrix() {
    assertJsonLd("index.html", ["WebSite", "Organization", "SoftwareApplication", "FAQPage", "WebPage"])
    assertJsonLd("blog.html", [["Blog", "CollectionPage"], "BreadcrumbList"])

    const blogPost = listFiles(path.join(distRoot, "blog"), ".html")
        .map((file) => path.relative(distRoot, file))
        .find((file) => !file.startsWith("blog/images/"))
    if (blogPost) assertJsonLd(blogPost, ["Article", "BreadcrumbList", "WebPage"])

    const verticalPage = listFiles(path.join(distRoot, "for"), ".html")
        .map((file) => path.relative(distRoot, file))[0]
    if (verticalPage) assertJsonLd(verticalPage, ["WebPage", "BreadcrumbList"])

    for (const legalPage of ["cookies.html", "disclaimer.html", "privacy.html", "terms.html"]) {
        assertJsonLd(legalPage, ["WebPage", "BreadcrumbList"])
    }
}

function legalRouteInfo(relativePath) {
    const parts = relativePath.split("/")
    const file = parts.at(-1)
    const page = file?.replace(/\.html$/u, "")
    if (!["cookies", "disclaimer", "privacy", "terms"].includes(page)) return null
    const locale = parts.length === 1 ? defaultLocale : parts[0]
    if (![defaultLocale, ...nonDefaultLocales].includes(locale)) return null
    return { locale, page }
}

function assertLegalRenderedDates() {
    for (const filePath of listFiles(distRoot, ".html")) {
        const relativePath = path.relative(distRoot, filePath)
        const routeInfo = legalRouteInfo(relativePath)
        if (!routeInfo) continue

        const sourcePath = `src/i18n/content/legal/${routeInfo.locale}/${routeInfo.page}.html`
        if (!existsSync(path.join(repoRoot, sourcePath))) {
            fail(`Missing legal source for dist/${relativePath}: ${sourcePath}`)
        }
        const source = read(sourcePath)
        const match = source.match(/^<!--\s*lastUpdated:\s*(\d{4}-\d{2}-\d{2})\s*-->/mu)
        if (!match) fail(`Missing lastUpdated metadata in ${sourcePath}`)

        const expectedDate = new Intl.DateTimeFormat(routeInfo.locale, {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
        }).format(new Date(`${match[1]}T00:00:00.000Z`))
        const html = normalizeWhitespace(readFileSync(filePath, "utf8"))
        if (!html.includes(normalizeWhitespace(expectedDate))) {
            fail(`Legal page rendered wrong lastUpdated date in dist/${relativePath}: expected ${expectedDate}`)
        }
    }
}

function localeHasBootstrap(locale) {
    const paths = [
        `src/i18n/messages/${locale}.json`,
        `src/i18n/content/home/${locale}.json`,
        `src/i18n/content/legal/${locale}`,
        `src/i18n/content/verticals/${locale}`,
        `src/content/blog/${locale}`,
    ]
    return paths.some((relativePath) => {
        const absolutePath = path.join(repoRoot, relativePath)
        if (!existsSync(absolutePath)) return false
        const files = statSync(absolutePath).isDirectory()
            ? listFiles(absolutePath, "")
            : [absolutePath]
        return files.some((filePath) => readFileSync(filePath, "utf8").includes("bootstrap-en"))
    })
}

function localeFromDistPath(relativePath) {
    const firstSegment = relativePath.split("/")[0]?.replace(/\.html$/u, "")
    return nonDefaultLocales.includes(firstSegment) ? firstSegment : defaultLocale
}

function robotsContent(document) {
    return collectElements(document, "meta")
        .filter((node) => getAttr(node, "name") === "robots")
        .map((node) => getAttr(node, "content") ?? "")
        .join(",")
}

function assertBootstrapRobotsState() {
    const localeBootstrap = new Map(nonDefaultLocales.map((locale) => [locale, localeHasBootstrap(locale)]))
    for (const filePath of listFiles(distRoot, ".html")) {
        const relativePath = path.relative(distRoot, filePath)
        const locale = localeFromDistPath(relativePath)
        if (locale === defaultLocale) continue
        const { document } = parseHtmlFile(relativePath)
        const robots = robotsContent(document)
        if (localeBootstrap.get(locale)) {
            if (!robots.includes("noindex") || !robots.includes("noarchive")) {
                fail(`Bootstrap locale page missing robots noindex,noarchive: dist/${relativePath}`)
            }
        } else if (robots.includes("noindex") || robots.includes("noarchive")) {
            fail(`Translated locale page still has bootstrap robots directives: dist/${relativePath}`)
        }
    }
}

function assertNoBootstrapLocaleAlternates() {
    const bootstrapLocales = nonDefaultLocales.filter((locale) => localeHasBootstrap(locale))
    if (bootstrapLocales.length === 0) return
    for (const filePath of listFiles(distRoot, ".html")) {
        const relativePath = path.relative(distRoot, filePath)
        const { document } = parseHtmlFile(relativePath)
        for (const link of collectElements(document, "link")) {
            const hreflang = getAttr(link, "hreflang")
            if (bootstrapLocales.includes(hreflang)) {
                fail(`Bootstrap locale leaked into hreflang in dist/${relativePath}: ${hreflang}`)
            }
        }
        for (const meta of collectElements(document, "meta")) {
            if (getAttr(meta, "property") === "og:locale:alternate") {
                fail(`Bootstrap phase must not emit og:locale:alternate in dist/${relativePath}`)
            }
        }
    }
}

function assertSitemapBootstrapState() {
    const sitemapFiles = listFiles(distRoot, ".xml")
        .filter((filePath) => path.basename(filePath).startsWith("sitemap"))
    const localePattern = nonDefaultLocales.map((locale) => locale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
    for (const filePath of sitemapFiles) {
        const relativePath = path.relative(repoRoot, filePath)
        const xml = readFileSync(filePath, "utf8")
        if (/https:\/\/duetmail\.com\/en(?:\/|<|"|$)/u.test(xml)) {
            fail(`Sitemap contains /en URL: ${relativePath}`)
        }
        if (/<xhtml:link\b/u.test(xml)) {
            fail(`Sitemap contains localized alternate links before translation activation: ${relativePath}`)
        }
        if (localePattern && new RegExp(`<loc>https://duetmail\\.com/(?:${localePattern})(?:/|<)`, "u").test(xml)) {
            fail(`Sitemap contains non-default locale URL before translation activation: ${relativePath}`)
        }
    }
}

try {
    if (!existsSync(distRoot)) fail("dist/ is missing; run pnpm build or pnpm i18n:build first")
    assertCopiedRoutesManifest()
    assertEnglishRouteJsonLdMatrix()
    assertLegalRenderedDates()
    assertBootstrapRobotsState()
    assertNoBootstrapLocaleAlternates()
    assertSitemapBootstrapState()
    console.log("i18n dist verification passed")
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
}
