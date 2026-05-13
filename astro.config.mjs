import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import sitemap from "@astrojs/sitemap"
import { defineConfig } from "astro/config"

const localeSource = JSON.parse(
    readFileSync(fileURLToPath(new URL("./src/i18n/locales.source.json", import.meta.url)), "utf8"),
)

const sitemapLocales = Object.fromEntries(
    localeSource.source_locale ? [[localeSource.source_locale, localeSource.source_locale]] : [["en", "en"]],
)
const bootstrapLocalePrefixes = new Set(
    localeSource.runtime_locales.filter((locale) => locale !== localeSource.source_locale),
)
const excludeBootstrapLocaleUrls = (pageUrl) => {
    const pathname = new URL(pageUrl).pathname
    const firstSegment = pathname.split("/").filter(Boolean)[0]
    if (firstSegment === "i18n-qa") return false
    return !firstSegment || !bootstrapLocalePrefixes.has(firstSegment)
}

export default defineConfig({
    output: "static",
    site: "https://duetmail.com",
    trailingSlash: "never",
    build: {
        format: "file",
    },
    integrations: [
        sitemap({
            filter: excludeBootstrapLocaleUrls,
            i18n: {
                defaultLocale: "en",
                locales: sitemapLocales,
            },
        }),
    ],
    vite: {
        plugins: [tailwindcss()],
    },
})
