import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import sitemap from "@astrojs/sitemap"
import { defineConfig } from "astro/config"

const localeSource = JSON.parse(
    readFileSync(fileURLToPath(new URL("./src/i18n/locales.source.json", import.meta.url)), "utf8"),
)

const sitemapLocales = Object.fromEntries(
    localeSource.runtime_locales.map((locale) => [locale, locale]),
)

export default defineConfig({
    output: "static",
    site: "https://duetmail.com",
    trailingSlash: "never",
    build: {
        format: "file",
    },
    integrations: [
        sitemap({
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
