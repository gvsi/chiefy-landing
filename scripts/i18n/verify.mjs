#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import vm from "node:vm"
import * as parse5 from "parse5"

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

function visitHtmlNodes(node, visitor) {
    visitor(node)
    for (const child of node.childNodes ?? []) visitHtmlNodes(child, visitor)
}

function getHtmlAttr(node, name) {
    return node.attrs?.find((attr) => attr.name === name)?.value
}

function assertBalancedLegalTags(relativePath, html) {
    for (const tag of ["a", "h1", "h2", "h3", "h4", "li", "p", "strong", "ul"]) {
        const openingCount = [...html.matchAll(new RegExp(`<${tag}(?:\\s|>|/)`, "giu"))].length
        const closingCount = [...html.matchAll(new RegExp(`</${tag}>`, "giu"))].length
        if (openingCount !== closingCount) {
            fail(`Unbalanced <${tag}> tags in ${relativePath}: ${openingCount} opening, ${closingCount} closing`)
        }
    }
}

function assertLegalHtmlStructure(relativePath, content) {
    if (/<ahref=/iu.test(content)) {
        fail(`Malformed collapsed anchor tag in ${relativePath}`)
    }
    if (/href=["']duetmail\.com["']/iu.test(content)) {
        fail(`Legal file must use an explicit HTTPS URL for duetmail.com: ${relativePath}`)
    }

    const html = stripLeadingMetadataComments(content).trim()
    if (!/^<h1\b[^>]*>[\s\S]*?<\/h1>/iu.test(html)) {
        fail(`Legal file must start with a closed h1 after metadata: ${relativePath}`)
    }
    assertBalancedLegalTags(relativePath, html)

    const parseErrors = []
    const fragment = parse5.parseFragment(html, {
        onParseError(error) {
            parseErrors.push(error)
        },
    })
    if (parseErrors.length > 0) {
        const summary = parseErrors
            .slice(0, 5)
            .map((error) => `${error.code}${error.startLine ? `:${error.startLine}:${error.startCol}` : ""}`)
            .join(", ")
        fail(`Legal HTML parse errors in ${relativePath}: ${summary}`)
    }

    visitHtmlNodes(fragment, (node) => {
        if (node.tagName !== "a") return
        const href = getHtmlAttr(node, "href")
        if (!href) fail(`Legal anchor missing href in ${relativePath}`)
        if (href === "duetmail.com") {
            fail(`Legal anchor must use https://duetmail.com in ${relativePath}`)
        }
    })
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

function containsUnlocalizedSameOriginRoute(content) {
    const routePathPattern = String.raw`(\/(?:blog|privacy|terms|cookies|disclaimer|for)(?:[/?#][^\s)"'<]*|(?=[\s)"'<]|$)))`
    const patterns = [
        new RegExp(String.raw`https:\/\/duetmail\.com${routePathPattern}`, "gu"),
        new RegExp(String.raw`(?:\]\(|href=["']|["'])${routePathPattern}`, "gu"),
    ]
    return patterns.some((pattern) =>
        [...content.matchAll(pattern)].some((match) => !match[1].startsWith("/blog/images/")),
    )
}

function assertBootstrapUrlsLocalized(relativePath) {
    const content = readText(relativePath)
    if (containsUnlocalizedSameOriginRoute(content)) {
        fail(`Non-default bootstrap file contains unlocalized same-origin route URL: ${relativePath}`)
    }
}

function assertReadingTimePluralMessages(locale, messages) {
    const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories
    for (const category of categories) {
        const key = `readingTime.${category}`
        if (typeof messages[key] !== "string") {
            fail(`Missing reading-time plural message ${key} for ${locale}`)
        }
    }
}

function assertEnglishReadingTimePluralSuperset(messages) {
    for (const category of ["zero", "one", "two", "few", "many", "other"]) {
        const key = `readingTime.${category}`
        if (typeof messages[key] !== "string") {
            fail(`English messages must expose reading-time plural superset key: ${key}`)
        }
    }
}

async function loadReadingTimeModuleForSmoke() {
    const source = readText("src/utils/readingTime.ts")
    const requiredExports = [
        "calculateReadingTimeForLocale",
        "formatReadingTimeForLocale",
        "formatDate",
    ]
    for (const exportName of requiredExports) {
        if (!source.includes(`function ${exportName}`)) {
            fail(`src/utils/readingTime.ts missing required export: ${exportName}`)
        }
    }
    if (!source.includes("Intl.Segmenter")) {
        fail("src/utils/readingTime.ts must use Intl.Segmenter for locale-aware word segmentation")
    }

    const ts = await import("typescript")
    const sourceWithoutImports = source.replace(/^import\s+.+$/gm, "")
    const compiled = ts.transpileModule(
        `const t = (messages, key, values = {}) => {
            const template = messages[key]
            if (typeof template !== "string") throw new Error("missing " + key)
            return template.replace(/\\{([A-Za-z0-9_]+)\\}/g, (match, token) =>
                Object.prototype.hasOwnProperty.call(values, token) ? String(values[token]) : match)
        }\n${sourceWithoutImports}`,
        {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
            },
        },
    )
    const sandbox = {
        exports: {},
        Intl,
        Math,
        Object,
        RegExp,
        String,
    }
    vm.runInNewContext(compiled.outputText, sandbox, {
        filename: "src/utils/readingTime.ts",
    })
    return sandbox.exports
}

async function assertReadingTimeSmokeChecks() {
    const readingTime = await loadReadingTimeModuleForSmoke()
    if (typeof readingTime.calculateReadingTimeForLocale !== "function") {
        fail("calculateReadingTimeForLocale is not executable")
    }
    const samples = {
        ja: "これは日本語の文章です。メールの内容をすばやく確認できます。".repeat(90),
        th: "นี่คือข้อความภาษาไทยสำหรับทดสอบการอ่านอีเมลอย่างรวดเร็ว".repeat(100),
        "zh-Hans": "这是中文内容用于测试邮件阅读时间的本地化计算。".repeat(100),
    }
    for (const [locale, sample] of Object.entries(samples)) {
        const minutes = readingTime.calculateReadingTimeForLocale(sample, locale)
        const whitespaceOnlyMinutes = Math.max(1, Math.ceil(sample.split(/\s+/).filter(Boolean).length / 238))
        if (minutes < 1) {
            fail(`Reading-time smoke sample returned less than one minute for ${locale}`)
        }
        if (minutes <= whitespaceOnlyMinutes) {
            fail(`Reading-time smoke sample did not exceed whitespace-only count for ${locale}`)
        }
    }
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

async function assertTask4UtilityLayer(locales) {
    assertFile("src/i18n/messages/schema.ts")
    assertFile("src/i18n/content.ts")
    assertFile("src/i18n/jsonLd.ts")

    const englishMessages = readJson("src/i18n/messages/en.json")
    assertEnglishReadingTimePluralSuperset(englishMessages)
    for (const locale of locales) {
        assertReadingTimePluralMessages(locale, readJson(`src/i18n/messages/${locale}.json`))
    }

    const schemaSource = readText("src/i18n/messages/schema.ts")
    for (const expected of ["getMessages", "type Messages", "function t"]) {
        if (!schemaSource.includes(expected)) fail(`src/i18n/messages/schema.ts missing ${expected}`)
    }

    const contentSource = readText("src/i18n/content.ts")
    for (const expected of [
        "getHomeContent",
        "getLegalContent",
        "getVerticalContent",
        "getAllVerticalContent",
        "getBlogPost",
        "getAllBlogPosts",
        "getRouteTranslationState",
        "robotsForTranslationState",
    ]) {
        if (!contentSource.includes(`function ${expected}`)) {
            fail(`src/i18n/content.ts missing required export: ${expected}`)
        }
    }
    if (!contentSource.includes('query: "?raw"') || !/getCollection\(\s*["']blog["']/u.test(contentSource)) {
        fail("src/i18n/content.ts must raw-load legal HTML and use getCollection(\"blog\") for blog posts")
    }
    if (!contentSource.includes("translationStatus") || !contentSource.includes("bootstrap-en")) {
        fail("src/i18n/content.ts must inspect bootstrap translation markers")
    }

    const jsonLdSource = readText("src/i18n/jsonLd.ts")
    for (const expected of ["serializeJsonLd", "escapeHtmlAttribute", "jsonLdScript", "\\\\u003c"]) {
        if (!jsonLdSource.includes(expected)) fail(`src/i18n/jsonLd.ts missing ${expected}`)
    }

    await assertReadingTimeSmokeChecks()
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

async function assertSourceContentFiles({ complete }) {
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
        fail(`Flat root blog posts remain after locale migration: ${flatBlogFiles.join(", ")}`)
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
        } else if (!complete) {
            if (messages.translationStatus !== "bootstrap-en") fail(`Missing bootstrap marker in messages: ${locale}`)
            if (home.translationStatus !== "bootstrap-en") fail(`Missing bootstrap marker in home content: ${locale}`)
        } else {
            if ("translationStatus" in messages) fail(`Bootstrap marker remains in complete mode: src/i18n/messages/${locale}.json`)
            if ("translationStatus" in home) fail(`Bootstrap marker remains in complete mode: src/i18n/content/home/${locale}.json`)
        }

        for (const page of legalPages) {
            if (locale !== localeSource.default_locale) {
                assertBootstrapUrlsLocalized(`src/i18n/content/legal/${locale}/${page}.html`)
            }
            const legal = readText(`src/i18n/content/legal/${locale}/${page}.html`)
            assertLegalHtmlStructure(`src/i18n/content/legal/${locale}/${page}.html`, legal)
            if (/<p\b[^>]*>\s*Last updated:/iu.test(legal)) {
                fail(`Copied legal file still has visible Last updated paragraph: ${locale}/${page}`)
            }
            if (locale === localeSource.default_locale) {
                if (!/^<!-- lastUpdated: \d{4}-\d{2}-\d{2} -->/u.test(legal)) {
                    fail(`Legal file has invalid metadata comments: ${locale}/${page}`)
                }
            } else if (complete) {
                if (/^<!-- translationStatus: bootstrap-en -->/u.test(legal) || legal.includes("translationStatus: bootstrap-en")) {
                    fail(`Bootstrap marker remains in complete mode: src/i18n/content/legal/${locale}/${page}.html`)
                }
                if (!/^<!-- lastUpdated: \d{4}-\d{2}-\d{2} -->/u.test(legal)) {
                    fail(`Legal file has invalid metadata comments: ${locale}/${page}`)
                }
            } else if (!/^<!-- translationStatus: bootstrap-en -->\n<!-- lastUpdated: \d{4}-\d{2}-\d{2} -->/u.test(legal)) {
                fail(`Legal file has invalid metadata comments: ${locale}/${page}`)
            }
        }

        for (const file of verticalFiles) {
            if (locale !== localeSource.default_locale) {
                assertBootstrapUrlsLocalized(`src/i18n/content/verticals/${locale}/${file}`)
            }
            const vertical = readJson(`src/i18n/content/verticals/${locale}/${file}`)
            if (locale === localeSource.default_locale) {
                if ("translationStatus" in vertical) fail(`English vertical must not have translationStatus: ${file}`)
            } else if (!complete && vertical.translationStatus !== "bootstrap-en") {
                fail(`Missing bootstrap marker in vertical: ${locale}/${file}`)
            } else if (complete && "translationStatus" in vertical) {
                fail(`Bootstrap marker remains in complete mode: src/i18n/content/verticals/${locale}/${file}`)
            }
            if (vertical.slug !== path.basename(file, ".json")) {
                fail(`Localized vertical slug must match English filename: ${locale}/${file}`)
            }
        }

        for (const file of englishBlogFiles) {
            const relativePath = `src/content/blog/${locale}/${file}`
            if (locale !== localeSource.default_locale) {
                assertBootstrapUrlsLocalized(relativePath)
            }
            const { frontmatter } = parseMarkdownFrontmatter(readText(relativePath), relativePath)
            const marker = frontmatterValue(frontmatter, "translationStatus")
            if (locale === localeSource.default_locale) {
                if (marker) fail(`English blog post must not have translationStatus: ${file}`)
            } else if (!complete && marker !== "bootstrap-en") {
                fail(`Missing bootstrap marker in blog post: ${locale}/${file}`)
            } else if (complete && (marker || readText(relativePath).includes("translationStatus: bootstrap-en"))) {
                fail(`Bootstrap marker remains in complete mode: ${relativePath}`)
            }
        }
    }

    const distPath = path.join(repoRoot, "dist")
    if (existsSync(distPath)) {
        for (const locale of locales) {
            for (const file of englishBlogFiles) {
                const relativePath = `src/content/blog/${locale}/${file}`
                const { frontmatter } = parseMarkdownFrontmatter(readText(relativePath), relativePath)
                if (frontmatterValue(frontmatter, "draft") === "true") {
                    const slug = path.basename(file, ".md")
                    const routePath = locale === localeSource.default_locale
                        ? `dist/blog/${slug}.html`
                        : `dist/${locale}/blog/${slug}.html`
                    if (existsSync(path.join(repoRoot, routePath))) {
                        fail(`Draft blog post was built: ${locale}/${slug}`)
                    }
                }
            }
        }
    }

    if (complete) {
        const checkedFiles = locales.flatMap((locale) => [
            `src/i18n/messages/${locale}.json`,
            `src/i18n/content/home/${locale}.json`,
            ...legalPages.map((page) => `src/i18n/content/legal/${locale}/${page}.html`),
            ...verticalFiles.map((file) => `src/i18n/content/verticals/${locale}/${file}`),
            ...englishBlogFiles.map((file) => `src/content/blog/${locale}/${file}`),
        ])
        for (const relativePath of checkedFiles) {
            const content = readFileSync(path.join(repoRoot, relativePath), "utf8")
            const nonDefault = !relativePath.includes(`/${localeSource.default_locale}/`) &&
                !relativePath.endsWith(`/${localeSource.default_locale}.json`)
            if (nonDefault && content.includes("bootstrap-en")) {
                fail(`Bootstrap marker remains in complete mode: ${relativePath}`)
            }
        }
    }

    await assertTask4UtilityLayer(locales)
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
        await assertSourceContentFiles({ complete: mode === "complete" })
    }
    console.log(`i18n verification passed (${mode}${phase ? `:${phase}` : ""})`)
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
}
