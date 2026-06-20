import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import sitemap from "@astrojs/sitemap"
import { defineConfig } from "astro/config"

const repoRoot = fileURLToPath(new URL(".", import.meta.url))
const localeSource = JSON.parse(
    readFileSync(fileURLToPath(new URL("./src/i18n/locales.source.json", import.meta.url)), "utf8"),
)
const nonDefaultLocales = localeSource.runtime_locales.filter((locale) => locale !== localeSource.default_locale)
const nonDefaultLocaleSet = new Set(nonDefaultLocales)

const sitemapLocales = Object.fromEntries(
    localeSource.runtime_locales.map((locale) => [locale, locale]),
)

function listFiles(absolutePath, out = []) {
    if (!existsSync(absolutePath)) return out

    const stat = statSync(absolutePath)
    if (!stat.isDirectory()) {
        out.push(absolutePath)
        return out
    }

    for (const entry of readdirSync(absolutePath)) {
        listFiles(path.join(absolutePath, entry), out)
    }
    return out
}

function localeHasBootstrapMarker(locale) {
    const paths = [
        `src/i18n/messages/${locale}.json`,
        `src/i18n/content/home/${locale}.json`,
        `src/i18n/content/legal/${locale}`,
        `src/i18n/content/verticals/${locale}`,
        `src/content/blog/${locale}`,
    ]
    return paths.some((relativePath) =>
        listFiles(path.join(repoRoot, relativePath)).some((filePath) =>
            readFileSync(filePath, "utf8").includes("bootstrap-en"),
        ),
    )
}

const hasBootstrapLocales = nonDefaultLocales.some((locale) => localeHasBootstrapMarker(locale))

function filterSitemapPage(page) {
    if (!hasBootstrapLocales) return true

    const firstSegment = new URL(page).pathname.split("/").filter(Boolean)[0]
    return !nonDefaultLocaleSet.has(firstSegment)
}

// Site origin for canonical / hreflang / sitemap. Post-flip collapse (ADR 0031):
// `main` is the Chiefy site, so the default is chiefy.com and a plain build is
// correct without env. SITE_URL can still override (kept for parity/preview builds).
const SITE_URL = (process.env.SITE_URL && process.env.SITE_URL.trim()) || "https://chiefy.com"

export default defineConfig({
    output: "static",
    site: SITE_URL,
    trailingSlash: "never",
    build: {
        format: "file",
    },
    integrations: [
        sitemap({
            filter: filterSitemapPage,
            ...(hasBootstrapLocales
                ? {}
                : {
                    i18n: {
                        defaultLocale: "en",
                        locales: sitemapLocales,
                    },
                }),
        }),
    ],
    vite: {
        plugins: [tailwindcss()],
    },
})
