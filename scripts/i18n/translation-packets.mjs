#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
const outDir = path.join(repoRoot, ".i18n-packets")
const fieldClassifications = JSON.parse(readFileSync(path.join(repoRoot, "src/i18n/fieldClassifications.json"), "utf8"))

function readJsonIfExists(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath)
    if (!existsSync(absolutePath)) return null
    return JSON.parse(readFileSync(absolutePath, "utf8"))
}

function listFiles(relativeDir, suffix, out = []) {
    const absoluteDir = path.join(repoRoot, relativeDir)
    if (!existsSync(absoluteDir)) return out
    for (const entry of readdirSync(absoluteDir)) {
        const absolutePath = path.join(absoluteDir, entry)
        const stat = statSync(absolutePath)
        if (stat.isDirectory()) listFiles(path.relative(repoRoot, absolutePath), suffix, out)
        else if (entry.endsWith(suffix)) out.push(path.relative(repoRoot, absolutePath))
    }
    return out
}

const packets = {
    schemaVersion: 1,
    notes: [
        "Translate by surface, not isolated key.",
        "Preserve locked fields, URLs, placeholders, legal metadata, provider/product names, and numeric/pricing values.",
        "Only sameOriginRoute URL values should be localized to the current locale route.",
    ],
    fieldClassifications,
    surfaces: {
        messages: readJsonIfExists("src/i18n/messages/en.json"),
        home: readJsonIfExists("src/i18n/content/home/en.json"),
        legal: Object.fromEntries(
            listFiles("src/i18n/content/legal/en", ".html").map((relativePath) => [
                path.basename(relativePath, ".html"),
                { path: relativePath, source: readFileSync(path.join(repoRoot, relativePath), "utf8") },
            ]),
        ),
        verticals: listFiles("src/i18n/content/verticals/en", ".json"),
        blog: listFiles("src/content/blog/en", ".md"),
    },
}

mkdirSync(outDir, { recursive: true })
writeFileSync(path.join(outDir, "landing.json"), `${JSON.stringify(packets, null, 2)}\n`)
console.log("Wrote .i18n-packets/landing.json")
