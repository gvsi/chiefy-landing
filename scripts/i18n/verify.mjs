#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
const args = process.argv.slice(2)

function argValue(name, fallback = undefined) {
    const prefix = `${name}=`
    const match = args.find((arg) => arg.startsWith(prefix))
    return match ? match.slice(prefix.length) : fallback
}

const mode = argValue("--mode", "complete")
const phase = argValue("--phase")
const localeScope = argValue("--locales")
    ?.split(",")
    .map((locale) => locale.trim())
    .filter(Boolean)

function fail(message) {
    throw new Error(message)
}

function readJson(relativePath) {
    return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"))
}

function readText(relativePath) {
    return readFileSync(path.join(repoRoot, relativePath), "utf8")
}

function runNodeScript(relativePath, scriptArgs = []) {
    const result = spawnSync(process.execPath, [path.join(repoRoot, relativePath), ...scriptArgs], {
        cwd: repoRoot,
        encoding: "utf8",
    })
    if (result.status !== 0) {
        process.stdout.write(result.stdout)
        process.stderr.write(result.stderr)
        fail(`${relativePath} failed`)
    }
}

function assertFile(relativePath) {
    if (!existsSync(path.join(repoRoot, relativePath))) fail(`Missing required file: ${relativePath}`)
}

function listFiles(relativePath, extension) {
    const directory = path.join(repoRoot, relativePath)
    if (!existsSync(directory)) fail(`Missing required directory: ${relativePath}`)
    return readdirSync(directory).filter((file) => file.endsWith(extension)).sort()
}

function stripLeadingMetadataComments(content) {
    return content.replace(/^(\s*<!--\s*(?:translationStatus|lastUpdated):[\s\S]*?-->\s*)+/u, "")
}

function stripVisibleLastUpdated(content) {
    return content.replace(/<p\b[^>]*>\s*Last updated:[\s\S]*?<\/p>\s*/iu, "")
}

function normalizeText(content) {
    return content.replace(/\r\n/g, "\n").trim()
}

function normalizeLegalContent(content) {
    return normalizeText(content).replace(/\n{2,}/g, "\n")
}

function parseMarkdownFrontmatter(content, relativePath) {
    if (!content.startsWith("---\n")) fail(`Markdown missing frontmatter: ${relativePath}`)
    const end = content.indexOf("\n---", 4)
    if (end === -1) fail(`Markdown missing closing frontmatter: ${relativePath}`)
    const frontmatter = content.slice(4, end)
    const body = content.slice(end + "\n---".length)
    return { frontmatter, body }
}

function frontmatterValue(frontmatter, key) {
    const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))
    return match?.[1]?.trim()
}

function assertNoDuplicateTopLevelJsonKeys(relativePath) {
    const content = readText(relativePath)
    const keys = new Set()
    const duplicates = new Set()
    const keyPattern = /^\s*"([^"]+)":/gm
    for (const match of content.matchAll(keyPattern)) {
        const key = match[1]
        if (keys.has(key)) duplicates.add(key)
        keys.add(key)
    }
    if (duplicates.size > 0) {
        fail(`Duplicate JSON keys in ${relativePath}: ${[...duplicates].sort().join(", ")}`)
    }
    readJson(relativePath)
}

function assertPackageScripts() {
    const packageJson = readJson("package.json")
    const requiredScripts = [
        "check",
        "functions:types",
        "functions:types:check",
        "functions:check",
        "functions:build",
        "i18n:sync-locales",
        "i18n:sync-locales:write",
        "i18n:sync-locales:root-check",
        "i18n:sync-glossary",
        "i18n:sync-glossary:write",
        "i18n:sync-glossary:root-check",
        "i18n:verify",
        "i18n:verify:contracts",
        "i18n:verify:source",
        "i18n:build",
        "i18n:verify:dist",
        "i18n:scan-source",
        "i18n:pseudo",
        "i18n:packets",
        "i18n:redirects",
    ]
    for (const script of requiredScripts) {
        if (!packageJson.scripts?.[script]) fail(`Missing package script: ${script}`)
    }
}

function assertLocaleContract() {
    runNodeScript("scripts/i18n/sync-locales.mjs")
    const localeSource = readJson("src/i18n/locales.source.json")
    const localesTs = readFileSync(path.join(repoRoot, "src/i18n/locales.ts"), "utf8")
    const runtimeLocales = localeSource.runtime_locales
    if (runtimeLocales.includes("ar") || runtimeLocales.includes("fa") || runtimeLocales.includes("he")) {
        fail("RTL locale leaked into runtime locales")
    }
    for (const locale of runtimeLocales) {
        if (!localesTs.includes(`"${locale}"`)) fail(`Locale missing from locales.ts: ${locale}`)
    }
}

function assertGlossaryContract() {
    runNodeScript("scripts/i18n/sync-glossary.mjs")
    const glossary = readJson("src/i18n/glossary.source.json")
    for (const term of ["Duet Mail", "Duet", "Gmail", "Outlook", "Google", "Microsoft", "Stripe", "Pro"]) {
        if (!glossary.locked_terms.includes(term)) fail(`Missing locked glossary term: ${term}`)
    }
}

function assertContractsPhase() {
    const requiredFiles = [
        "src/i18n/locales.source.json",
        "src/i18n/glossary.source.json",
        "src/i18n/locales.ts",
        "src/i18n/routing.ts",
        "src/i18n/fieldClassifications.json",
        "scripts/i18n/sync-locales.mjs",
        "scripts/i18n/sync-glossary.mjs",
        "scripts/i18n/verify.mjs",
        "scripts/i18n/build.mjs",
        "scripts/i18n/verify-dist.mjs",
        "scripts/i18n/scan-source.mjs",
        "scripts/i18n/pseudo.mjs",
        "scripts/i18n/translation-packets.mjs",
        "scripts/i18n/redirect-contracts.mjs",
        "scripts/i18n/fixtures/redirect-contracts.json",
        "functions/redirectCore.mjs",
        "functions/redirectCore.d.mts",
        "functions/[[path]].ts",
        "functions/securityHeaders.ts",
        "functions/tsconfig.json",
        "public/_routes.json",
        "wrangler.jsonc",
    ]
    requiredFiles.forEach(assertFile)
    assertLocaleContract()
    assertGlossaryContract()
    assertPackageScripts()
    runNodeScript("scripts/i18n/redirect-contracts.mjs", ["--check"])
}

function assertSourceContentFiles({ complete }) {
    const localeSource = readJson("src/i18n/locales.source.json")
    const locales = localeScope ?? localeSource.runtime_locales
    const legalPages = ["cookies", "disclaimer", "privacy", "terms"]
    const verticalFiles = listFiles("src/data/verticals", ".json")
    const englishBlogFiles = listFiles("src/content/blog/en", ".md")

    assertNoDuplicateTopLevelJsonKeys("src/i18n/messages/en.json")

    for (const locale of locales) {
        assertFile(`src/i18n/messages/${locale}.json`)
        assertFile(`src/i18n/content/home/${locale}.json`)
        for (const page of legalPages) {
            assertFile(`src/i18n/content/legal/${locale}/${page}.html`)
        }
        for (const file of verticalFiles) {
            assertFile(`src/i18n/content/verticals/${locale}/${file}`)
        }
        for (const file of englishBlogFiles) {
            assertFile(`src/content/blog/${locale}/${file}`)
        }
    }

    const flatBlogFiles = readdirSync(path.join(repoRoot, "src/content/blog"))
        .filter((file) => file.endsWith(".md"))
        .sort()
    if (flatBlogFiles.length > 0) {
        for (const file of flatBlogFiles) {
            const legacy = readText(`src/content/blog/${file}`)
            const copied = readText(`src/content/blog/en/${file}`)
            if (normalizeText(legacy) !== normalizeText(copied)) {
                fail(`English blog copy differs from legacy flat source: ${file}`)
            }
        }
    }

    for (const page of legalPages) {
        const legacy = normalizeLegalContent(stripVisibleLastUpdated(readText(`src/snippets/legal/${page}.html`)))
        const copied = normalizeLegalContent(stripVisibleLastUpdated(stripLeadingMetadataComments(readText(`src/i18n/content/legal/en/${page}.html`))))
        if (legacy !== copied) {
            fail(`English legal copy differs from legacy snippet: ${page}`)
        }
        if (!/^<!-- lastUpdated: \d{4}-\d{2}-\d{2} -->/u.test(readText(`src/i18n/content/legal/en/${page}.html`))) {
            fail(`English legal file missing leading lastUpdated comment: ${page}`)
        }
    }

    for (const file of verticalFiles) {
        const legacy = readJson(`src/data/verticals/${file}`)
        const copied = readJson(`src/i18n/content/verticals/en/${file}`)
        if (JSON.stringify(legacy) !== JSON.stringify(copied)) {
            fail(`English vertical JSON differs from legacy source: ${file}`)
        }
        if (copied.slug !== path.basename(file, ".json")) {
            fail(`Vertical slug must match filename: ${file}`)
        }
    }

    const supportedLocaleSet = new Set(localeSource.runtime_locales)
    const blogDirs = readdirSync(path.join(repoRoot, "src/content/blog"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    for (const locale of locales) {
        if (!blogDirs.includes(locale)) fail(`Missing blog locale directory with canonical casing: ${locale}`)
    }
    for (const directory of blogDirs) {
        if (!supportedLocaleSet.has(directory)) fail(`Unexpected blog locale directory: ${directory}`)
    }

    const contentConfig = readText("src/content.config.ts")
    if (!contentConfig.includes("generateId") || !contentConfig.includes('entry.replace(/\\.md$/, "")')) {
        fail("Blog collection must preserve locale directory casing with glob generateId")
    }

    for (const locale of locales) {
        const messages = readJson(`src/i18n/messages/${locale}.json`)
        const home = readJson(`src/i18n/content/home/${locale}.json`)
        if (locale === localeSource.default_locale) {
            if ("translationStatus" in messages) fail("English messages must not have translationStatus")
            if ("translationStatus" in home) fail("English home content must not have translationStatus")
        } else {
            if (messages.translationStatus !== "bootstrap-en") fail(`Missing bootstrap marker in messages: ${locale}`)
            if (home.translationStatus !== "bootstrap-en") fail(`Missing bootstrap marker in home content: ${locale}`)
        }

        for (const page of legalPages) {
            const legal = readText(`src/i18n/content/legal/${locale}/${page}.html`)
            if (/<p\b[^>]*>\s*Last updated:/iu.test(legal)) {
                fail(`Copied legal file still has visible Last updated paragraph: ${locale}/${page}`)
            }
            const expectedPrefix = locale === localeSource.default_locale
                ? /^<!-- lastUpdated: \d{4}-\d{2}-\d{2} -->/u
                : /^<!-- translationStatus: bootstrap-en -->\n<!-- lastUpdated: \d{4}-\d{2}-\d{2} -->/u
            if (!expectedPrefix.test(legal)) {
                fail(`Legal file has invalid metadata comments: ${locale}/${page}`)
            }
        }

        for (const file of verticalFiles) {
            const vertical = readJson(`src/i18n/content/verticals/${locale}/${file}`)
            if (locale === localeSource.default_locale) {
                if ("translationStatus" in vertical) fail(`English vertical must not have translationStatus: ${file}`)
            } else if (vertical.translationStatus !== "bootstrap-en") {
                fail(`Missing bootstrap marker in vertical: ${locale}/${file}`)
            }
            if (vertical.slug !== path.basename(file, ".json")) {
                fail(`Localized vertical slug must match English filename: ${locale}/${file}`)
            }
        }

        for (const file of englishBlogFiles) {
            const relativePath = `src/content/blog/${locale}/${file}`
            const { frontmatter } = parseMarkdownFrontmatter(readText(relativePath), relativePath)
            const marker = frontmatterValue(frontmatter, "translationStatus")
            if (locale === localeSource.default_locale) {
                if (marker) fail(`English blog post must not have translationStatus: ${file}`)
            } else if (marker !== "bootstrap-en") {
                fail(`Missing bootstrap marker in blog post: ${locale}/${file}`)
            }
        }
    }

    const distPath = path.join(repoRoot, "dist")
    if (existsSync(distPath)) {
        for (const file of englishBlogFiles) {
            const relativePath = `src/content/blog/en/${file}`
            const { frontmatter } = parseMarkdownFrontmatter(readText(relativePath), relativePath)
            if (frontmatterValue(frontmatter, "draft") === "true") {
                const slug = path.basename(file, ".md")
                if (existsSync(path.join(repoRoot, `dist/blog/${slug}.html`))) {
                    fail(`Draft blog post was built: ${slug}`)
                }
            }
        }
    }

    if (complete) {
        const checkedFiles = locales.flatMap((locale) => [
            `src/i18n/messages/${locale}.json`,
            `src/i18n/content/home/${locale}.json`,
        ])
        for (const relativePath of checkedFiles) {
            const content = readFileSync(path.join(repoRoot, relativePath), "utf8")
            if (localeSource.default_locale !== path.basename(relativePath, ".json") && content.includes("bootstrap-en")) {
                fail(`Bootstrap marker remains in complete mode: ${relativePath}`)
            }
        }
    }
}

try {
    if (!["source", "complete"].includes(mode)) fail(`Unsupported --mode: ${mode}`)
    if (phase && !(mode === "source" && phase === "contracts")) {
        fail("--phase is currently supported only as --mode=source --phase=contracts")
    }
    if (phase === "contracts") {
        assertContractsPhase()
    } else {
        assertContractsPhase()
        assertSourceContentFiles({ complete: mode === "complete" })
    }
    console.log(`i18n verification passed (${mode}${phase ? `:${phase}` : ""})`)
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
}
