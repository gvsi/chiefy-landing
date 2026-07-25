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
const localeScopeArg = argValue("--locales")
const localeScope = localeScopeArg
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

const glossarySource = readJson("src/i18n/glossary.source.json")

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
    if (/href=["']chiefy\.com["']/iu.test(content)) {
        fail(`Legal file must use an explicit HTTPS URL for chiefy.com: ${relativePath}`)
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
        const invalidAttr = node.attrs?.find((attr) =>
            /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(attr.name),
        )
        if (invalidAttr) {
            fail(`Legal anchor has translated text inside attributes in ${relativePath}: ${invalidAttr.name}`)
        }
        const href = getHtmlAttr(node, "href")
        if (!href) fail(`Legal anchor missing href in ${relativePath}`)
        if (href === "chiefy.com") {
            fail(`Legal anchor must use https://chiefy.com in ${relativePath}`)
        }
        if (/^https?:\/\//iu.test(href)) {
            const rel = getHtmlAttr(node, "rel")
            if (rel !== "external nofollow noopener") {
                fail(`External legal anchor must preserve rel="external nofollow noopener" in ${relativePath}: ${href}`)
            }
        }
    })
}

const legalEnglishLeftoverPhrases = [
    "By email:",
    "Contact Us",
    "Your California Privacy Rights",
    "Policy as Required by California Online Privacy Protection Act",
    "All About Cookies",
    "All About\n    Cookies",
    "समानीका0नी",
    "ServiceProvider",
    "ServiceProviders",
    "serviceProviders",
    "serviceProvider",
    "DienstProvider",
    "DienstProviders",
    "ServiceProvidere",
    "TjenestenProvidere",
    "DienstProvidere",
    "dataPro",
    "DataPro",
    "Protectie",
    "Protektions",
    "PrivacyProtection",
    "andProfessions",
    "IntellektuelProperty",
    "IntellektuellerProperty",
    "IntellectueelProperty",
    "IntellektuellProperty",
    "智慧型Property",
    "智力Pro属性",
    "Pro视频",
    "Pro文斯",
    "Pro职业",
    "Pro愿景",
    "OpenAI's processing of information inside ChatGPT",
    "We may disclose Your personal information",
    "Use of Your Personal Data",
    "Do Not Sell My Personal Information",
    "Do Not Sell My",
    "Limit the Use or Disclosure of My Sensitive Personal Information",
    "Limit the Use or Disclosure",
    "Privacy Preferences",
    "Update Privacy Preferences",
    "Last updated",
    "contact Us",
    "contact us",
]

const publishedContentLeftoverPhrases = [
    "Image Placeholder",
    "Placeholder for Image",
    "PlaceholderQuery",
    "Alt Text:",
    "Caption:",
]

const publishedContentLeftoverPatterns = [
    /\\?\[Placeholder for Image:[^\]]+\]/u,
    /\\?\[Placeholder[^\]]+\]/iu,
    /\\?\[url:placeholder_[^\]]+\]/iu,
    /\*\*(?:Képhelyőrző|Kueri Gambar Placeholder)[^\n]*/iu,
]

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
}

const glossaryGlueTerms = [...new Set(glossarySource.provider_terms ?? [])]
const glossaryGluePatterns = glossaryGlueTerms.flatMap((term) => [
    new RegExp(`(?<=[\\p{Script=Latin}\\p{N}])${escapeRegex(term)}`, "u"),
    new RegExp(`${escapeRegex(term)}(?=[\\p{Lu}\\p{N}])`, "u"),
])

const protectedTermGluePatterns = [
    ...glossaryGluePatterns,
    /\bAI(?=[\p{Ll}]{2,}|\p{N})/u,
    /(?<=[\p{Ll}\p{N}])AI\b/u,
    /(?<=[\p{Script=Latin}\p{N}])ChatGPT/u,
    /ChatGPT(?=[\p{Script=Latin}\p{N}])/u,
    /\bGPT(?=[\p{L}\p{N}])/u,
    /(?<=[\p{L}\p{N}])GPT\b/u,
    /(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])Pro/u,
    /Pro(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/u,
]
const legalArtifactPatterns = [
    /(?<=[\p{L}\p{N}])(?:GDPR|CCPA\/CPRA)/u,
    /(?:GDPR|CCPA\/CPRA)(?=[\p{L}\p{N}])/u,
    /\bPro(?=[\p{Lu}])/u,
    /(?<=[\p{Ll}])Pro(?:\b|-|(?=[\p{Ll}]))/u,
    /CASA(?=[\p{L}\p{N}])/u,
    /termsfeed\.com\/[^"'\s>]*\/blog\/[^"'\s>]*\/cookies/u,
]
const longEnglishRunLocales = new Set(["ja", "ko", "th", "zh-Hans", "zh-Hant"])
const allowedProtectedTermGluePrefixes = ["ProWritingAid", "Proton"]

function assertNoPublishedContentPlaceholders(relativePath, content) {
    for (const phrase of publishedContentLeftoverPhrases) {
        if (content.includes(phrase)) {
            fail(`Published content contains authoring placeholder or broken source fragment in ${relativePath}: ${phrase}`)
        }
    }
    for (const pattern of publishedContentLeftoverPatterns) {
        const match = content.match(pattern)
        if (match) {
            fail(`Published content contains authoring placeholder or broken source fragment in ${relativePath}: ${match[0]}`)
        }
    }
}

function assertNoProtectedTermGlue(locale, relativePath, content) {
    if (locale === "en") return
    for (const pattern of protectedTermGluePatterns) {
        const globalPattern = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)
        for (const match of content.matchAll(globalPattern)) {
            const index = match.index ?? 0
            if (match[0] === "AI" && content.slice(index - 4, index + 2) === "OpenAI") {
                continue
            }
            if (match[0] === "AI" && content.slice(index - 1, index + 2) === "NAI") {
                continue
            }
            if (match[0] === "GPT" && content.slice(index - 4, index + 3) === "ChatGPT") {
                continue
            }
            if (allowedProtectedTermGluePrefixes.some((term) => content.startsWith(term, index))) {
                continue
            }
            const excerpt = content.slice(Math.max(0, index - 40), index + 80).replace(/\s+/g, " ")
            fail(`Protected glossary term appears glued to surrounding text in ${relativePath}: ${excerpt}`)
        }
    }
}

function assertNoProtectedTermGlueInValue(locale, relativePath, value) {
    visitStringValues(value, (content, keyPath) => {
        assertNoProtectedTermGlue(locale, `${relativePath}:${keyPath.join(".")}`, content)
    })
}

function assertNoLongEnglishRuns(locale, relativePath, content) {
    if (!longEnglishRunLocales.has(locale)) return
    const text = content
        .replace(/^---[\s\S]*?---/u, "")
        .replace(/https?:\/\/\S+/gu, "")
        .replace(/\/blog\/images\/\S+/gu, "")
    const match = text.match(/\b[A-Za-z]{4,}(?:\s+[A-Za-z]{4,}){3,}\b/u)
    if (match) {
        const index = match.index ?? 0
        const excerpt = text.slice(Math.max(0, index - 40), index + 140).replace(/\s+/g, " ")
        fail(`Likely English sentence remains in non-English blog body ${relativePath}: ${excerpt}`)
    }
}

function assertNoLegalArtifacts(relativePath, content) {
    for (const pattern of legalArtifactPatterns) {
        const match = content.match(pattern)
        if (match) {
            const index = match.index ?? 0
            const excerpt = content.slice(Math.max(0, index - 40), index + 100).replace(/\s+/g, " ")
            fail(`Legal content contains likely generator artifact in ${relativePath}: ${excerpt}`)
        }
    }
}

function assertNoHighVisibilityEnglishLegalLeftovers(relativePath, content) {
    for (const phrase of legalEnglishLeftoverPhrases) {
        if (content.includes(phrase)) {
            fail(`High-visibility English legal copy remains in ${relativePath}: ${phrase}`)
        }
    }
}

function legalLastUpdated(relativePath) {
    const match = readText(relativePath).match(/^<!-- lastUpdated: (\d{4}-\d{2}-\d{2}) -->/u)
    return match?.[1]
}

const requiredLocalizedMessageKeys = [
    "blog.index.title",
    "blog.pages.index.title",
    "legalNav.disclaimer",
    "legal.pages.disclaimer.title",
]

const disallowedLocalizedMessageValues = {
    "legalNav.home": new Set(["a casa", "Bahay", "Дом", "Ev", "家", "집", "Koti", "Rumah", "Thuis", "Zuhause", "Σπίτι", "ቤት", "বাড়ি", "வீடு", "വീട്"]),
    "legalNav.cookies": new Set(["Kekse", "Koekjes", "kue", "饼干"]),
    "blog.index.issue": new Set(["いいえ {issue}", "아니요. {issue}", "Nee.{issue}", "Nej.{issue}", "Nei. {issue}", "Tidak.{issue}", "Hayır. {issue}", "Hindi. {issue}", "Nu. {issue}"]),
    "footer.legal": new Set(["합법적인"]),
}

function assertMessageQualityContracts(locale, messages, englishMessages) {
    const titleSuffix = messages["blog.titleSuffix"]
    if (typeof titleSuffix !== "string" || !/^\{title\} \| \S/u.test(titleSuffix)) {
        fail(`blog.titleSuffix must preserve "{title} | " spacing for ${locale}`)
    }

    for (const [key, value] of Object.entries(messages)) {
        if (typeof value !== "string") continue
        if (/[\p{Script=Latin}]\{[A-Za-z_][A-Za-z0-9_]*\}/u.test(value) || /\{[A-Za-z_][A-Za-z0-9_]*\}[\p{Script=Latin}]/u.test(value)) {
            fail(`Message placeholder is glued to Latin text for ${locale}: ${key}`)
        }
        if (/[:©]\{[A-Za-z_][A-Za-z0-9_]*\}/u.test(value)) {
            fail(`Message placeholder is missing visible separator spacing for ${locale}: ${key}`)
        }
        if (disallowedLocalizedMessageValues[key]?.has(value)) {
            fail(`Message contains known wrong-context translation for ${locale}: ${key}`)
        }
    }

    if (locale === "en") return
    for (const key of requiredLocalizedMessageKeys) {
        if (messages[key] === englishMessages[key]) {
            fail(`High-visibility message still equals English for ${locale}: ${key}`)
        }
    }

    if (locale === "en-XA") return
    // Same two contracts as home content, applied to the live nav/footer catalog.
    const brandViolations = []
    const leakViolations = []
    for (const [key, english] of Object.entries(englishMessages)) {
        const value = messages[key]
        if (typeof english !== "string" || typeof value !== "string") continue
        if (brandLockedValues.has(english)) {
            if (value !== english) {
                brandViolations.push(`${key}: expected ${JSON.stringify(english)}, found ${JSON.stringify(value)}`)
            }
            continue
        }
        if (!nonLatinScriptLocales.has(locale)) continue
        if (value !== english || localeInvariantMessageKeys.has(key)) continue
        if (latinTokenAllowlist.has(value.trim())) continue
        if (!/[A-Za-z]{2}/u.test(value)) continue
        leakViolations.push(`${key}: ${JSON.stringify(value)}`)
    }
    const sections = []
    if (brandViolations.length) {
        sections.push(`  translated a locked brand name:\n    ${brandViolations.join("\n    ")}`)
    }
    if (leakViolations.length) {
        sections.push(`  still equals English (non-Latin-script locale):\n    ${leakViolations.join("\n    ")}`)
    }
    if (sections.length) fail(`Message catalog contract failures for ${locale}:\n${sections.join("\n")}`)
}

function sortedJsonKeys(value) {
    return Object.keys(value).sort()
}

function assertMessageKeyParity(locale, messages, englishMessages) {
    const englishKeys = sortedJsonKeys(englishMessages)
    const localeKeys = sortedJsonKeys(messages).filter((key) => key !== "translationStatus")
    const missing = englishKeys.filter((key) => !localeKeys.includes(key))
    const extra = localeKeys.filter((key) => !englishKeys.includes(key))
    if (missing.length > 0) {
        fail(`Missing message keys for ${locale}: ${missing.join(", ")}`)
    }
    if (extra.length > 0) {
        fail(`Extra message keys for ${locale}: ${extra.join(", ")}`)
    }
}

function messagePlaceholders(value) {
    return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort()
}

function assertMessagePlaceholderParity(locale, messages, englishMessages) {
    if (locale === "en") return
    for (const [key, englishValue] of Object.entries(englishMessages)) {
        const localizedValue = messages[key]
        if (typeof englishValue !== "string" || typeof localizedValue !== "string") continue
        const englishPlaceholders = messagePlaceholders(englishValue)
        const localizedPlaceholders = messagePlaceholders(localizedValue)
        if (englishPlaceholders.join(",") !== localizedPlaceholders.join(",")) {
            fail(
                `Placeholder mismatch for ${locale}: ${key} expected {${englishPlaceholders.join("},{")}} got {${localizedPlaceholders.join("},{")}}`,
            )
        }
    }
}

function visitStringValues(value, visitor, keyPath = []) {
    if (typeof value === "string") {
        visitor(value, keyPath)
    } else if (Array.isArray(value)) {
        value.forEach((item, index) => visitStringValues(item, visitor, [...keyPath, String(index)]))
    } else if (value && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
            visitStringValues(nested, visitor, [...keyPath, key])
        }
    }
}

const disallowedNonEnglishHomeExactValues = new Set([
    "Tuesday, at 10am",
    "Thursday, at 2pm",
    "Friday, 9am",
    "Follow",
    "Reschedule?",
    "Yesterday",
    "Dec 20",
    "2 days ago",
    "12 hours ago",
])

const disallowedItalianHomeExactValues = new Set([
    "Biscotti",
    "Redigere una risposta",
    "Redigere anche la risposta?",
    "Riprogrammare?",
    "Pianificare anche un follow-up?",
])

// Values that must stay byte-identical in every locale. These name real products,
// companies, and destinations — translating one turns a recognizable link label
// into a phrase nobody searches for ("Startup Fame" -> "Startup-Ruhm").
const brandLockedValues = new Set([
    "Chiefy",
    "Gmail",
    "Outlook",
    "Google",
    "Microsoft",
    "Stripe",
    "LinkedIn",
    "Instagram",
    "X",
    "Startup Fame",
    // Plan tiers are identifiers, not copy. The app localizes the sentence
    // around them and keeps the tier itself English ("Basic-Tarif auswählen",
    // "Pro に進む"), and Stripe, billing email, and support all use these exact
    // words — so a translated tier name breaks the trail from pricing page to
    // checkout to support ticket. `Pro` was already locked by the glossary;
    // locking only one of three is what let the other two drift.
    "Basic",
    "Pro",
    "Enterprise",
])

// Locales whose UI is written in a non-Latin script. A value here that is still
// byte-identical to the English source, and still contains Latin letters, is an
// untranslated leak rather than a loanword — the distinction Latin-script
// locales cannot make mechanically ("Blog" is correct German).
const nonLatinScriptLocales = new Set([
    "am", "bg", "bn", "el", "gu", "hi", "ja", "kn", "ko",
    "ml", "mr", "ru", "ta", "te", "th", "uk", "zh-Hans", "zh-Hant",
])

// Latin tokens that legitimately survive untranslated in a non-Latin-script
// locale: brand names above, plus initialisms these locales use verbatim.
const latinTokenAllowlist = new Set([...brandLockedValues, "Chrome", "FAQ", "AI", "OAuth", "USD", "Web", "PDF", "vs"])

// Fabricated people and companies in the mock inbox. Leaving these in Latin
// script is a legitimate choice, so equality with English proves nothing.
// Scoped by value rather than by a blanket `.from` path pattern, because the
// same field also holds translatable role labels ("Marketing", "Design Team",
// "Newsletter") that must not be exempted.
const sampleIdentityValues = new Set([
    "Alex Rivera",
    "Emma Park",
    "Sarah Chen",
    "Michael Torres",
    "Shopify",
])

// Paths carrying mock inbox data, machine values, or identifiers. These are the
// same in every locale by design, so equality with English proves nothing.
// Matched against the full path, array indices included.
const localeInvariantHomePathPatterns = [
    /avatarLetter$/, /avatarKey$/, /logoName$/, /\.id$/, /\.action$/, /\.href$/,
    /providers\.\d+$/, /^draftShowcase\.draft\.to$/, /emailTimes/,
    /\.time$/, /\.duration$/, /fileName$/, /fileSize$/,
    /^testimonials\.items\.\d+\.name$/, /copyright/, /^footer\.tagline$/,
    /^footer\.brandLogoAlt$/, /^faq\.footerBrand$/, /^math\.duetLabel$/,
    // pricing.plans[*].name is no longer allowlisted — the tier names are in
    // brandLockedValues, so equality with English is now required, not ignored.
    // Only the machine-valued part of jsonLd is locale-invariant. The rest
    // (websiteAlternateName, browserRequirements, descriptions, offer names) is
    // translatable SEO copy that ships inside the rendered ld+json.
    /^jsonLd\.urls\./, /^jsonLd\.applicationCategory$/, /^jsonLd\.operatingSystem$/,
    /^jsonLd\.offers\.\d+\.(price|priceCurrency|unitText)$/,
]

function isLocaleInvariantHomePath(fullPath) {
    return localeInvariantHomePathPatterns.some((pattern) => pattern.test(fullPath))
}

// The brand lock only fires on values whose ENTIRE English text is a locked
// name, so a brand embedded in a sentence slips through it. That is how the
// rebrand left "Inaayos ng duet ang iyong inbox" on the Filipino page and
// "DuetKI-E-Mail-Autor" on the German one. This is a token-level backstop for
// the one name we have actually migrated away from.
const retiredBrandPattern = /\bduet\b/iu
// The tagline names the old brand on purpose; hrefs still carry legacy slugs.
const retiredBrandExemptPattern = /^https?:|duetmail\.com|formerly Duet Mail|Duet Mail\b/iu

function assertNoRetiredBrand(locale, relativePath, root) {
    const hits = []
    visitStringValues(root, (value, keyPath) => {
        if (!retiredBrandPattern.test(value)) return
        if (retiredBrandExemptPattern.test(value)) return
        hits.push(`${keyPath.join(".")}: ${JSON.stringify(value.slice(0, 90))}`)
    })
    if (hits.length) {
        fail(`Retired brand name "Duet" still present for ${locale} in ${relativePath}:\n  ${hits.join("\n  ")}`)
    }
}

// Live nav/footer catalog keys whose English value carries nothing translatable
// once the brand name is removed.
const localeInvariantMessageKeys = new Set([
    "footer.copyright",
    "footer.copyrightTemplate",
])

// Every runtime locale must be classified, so a newly added locale cannot ship
// with the leak check silently disabled.
const latinScriptLocales = new Set([
    "ca", "cs", "da", "de", "en", "en-XA", "es", "et", "fi", "fil", "fr", "hr", "hu",
    "id", "it", "lt", "lv", "ms", "nb", "nl", "pl", "pt-BR", "pt-PT", "ro", "sk",
    "sl", "sr", "sv", "sw", "tr", "vi",
])

function assertLocaleScriptClassification(locales) {
    const unclassified = locales.filter(
        (locale) => !nonLatinScriptLocales.has(locale) && !latinScriptLocales.has(locale),
    )
    if (unclassified.length) {
        fail(
            `Locale is not classified as Latin or non-Latin script, so the English-leak check would silently skip it: ${unclassified.join(", ")}`,
        )
    }
}

// Unsorted, so object-key reordering is caught too.
//
// KNOWN LIMIT: this cannot detect reordered *array elements*. Paths are
// positional (`jsonLd.faq.0.question`), so swapping two same-shaped entries
// yields an identical path list either way. An untranslated locale could
// therefore reorder same-shaped entries and have its English values read as
// "translated" at their new indices, skipping the leak check. Closing that
// needs token-level script purity (flagging Latin runs in a non-Latin locale
// regardless of equality with English), which requires allowlisting embedded
// brand tokens first — see the deferred multi-word sweep.
function homeStringPaths(value) {
    const paths = []
    visitStringValues(value, (_stringValue, keyPath) => paths.push(keyPath.join(".")))
    return paths
}

// The leak and brand checks compare English to localized values by exact path.
// If a locale's structure drifts, those lookups miss and the checks pass
// vacuously — so parity is a precondition, not a nicety.
function assertHomeStructureParity(locale, home, englishHome) {
    const english = homeStringPaths(englishHome).join("\n")
    const localized = homeStringPaths(home)
        .filter((keyPath) => keyPath !== "translationStatus")
        .join("\n")
    if (english !== localized) {
        fail(`Home content string structure diverges from English for ${locale}`)
    }
}

function assertHomeQualityContracts(locale, home, englishHome) {
    if (locale !== "en-XA" && home.faq?.footerBrand !== "CHIEFY") {
        fail(`Home FAQ brand must preserve Chiefy for ${locale}`)
    }

    // Brand lock + script purity. Collected and reported together: fixing these
    // one exception per CI run is what let the corpus drift in the first place.
    if (locale !== "en" && locale !== "en-XA") {
        // Key on the full path including array indices: sibling entries such as
        // footer.groups[3].links[*].label are distinct strings. Positions lining
        // up across locales is guaranteed by assertHomeStructureParity, which
        // must run before this — without it a renamed or reordered key would
        // resolve to undefined here and be skipped silently.
        const englishValues = new Map()
        visitStringValues(englishHome, (value, keyPath) => {
            englishValues.set(keyPath.join("."), value)
        })
        const brandViolations = []
        const leakViolations = []
        visitStringValues(home, (value, keyPath) => {
            const dotted = keyPath.join(".")
            const english = englishValues.get(dotted)
            if (typeof english !== "string") return

            // A brand-locked value is fully decided by this check either way —
            // matching English is the requirement, so never fall through to the
            // leak check, which would read that very match as a leak.
            if (brandLockedValues.has(english)) {
                if (value !== english) {
                    brandViolations.push(`${dotted}: expected ${JSON.stringify(english)}, found ${JSON.stringify(value)}`)
                }
                return
            }
            if (!nonLatinScriptLocales.has(locale)) return
            if (value !== english || isLocaleInvariantHomePath(dotted)) return
            if (latinTokenAllowlist.has(value.trim()) || sampleIdentityValues.has(value.trim())) return
            if (!/[A-Za-z]{2}/u.test(value)) return
            leakViolations.push(`${dotted}: ${JSON.stringify(value)}`)
        })
        // Report both classes together — failing brands first would hide every
        // leak in the same locale and cost another fix-and-rerun cycle.
        const sections = []
        if (brandViolations.length) {
            sections.push(`  translated a locked brand name:\n    ${brandViolations.join("\n    ")}`)
        }
        if (leakViolations.length) {
            sections.push(`  still equals English (non-Latin-script locale):\n    ${leakViolations.join("\n    ")}`)
        }
        if (sections.length) fail(`Home content contract failures for ${locale}:\n${sections.join("\n")}`)
    }

    if (home.jsonLd?.applicationCategory !== englishHome.jsonLd?.applicationCategory) {
        fail(`Home JSON-LD applicationCategory must preserve schema.org enum for ${locale}`)
    }
    const englishOfferUnitTexts = (englishHome.jsonLd?.offers ?? []).map((offer) => offer.unitText ?? null)
    const localizedOfferUnitTexts = (home.jsonLd?.offers ?? []).map((offer) => offer.unitText ?? null)
    if (JSON.stringify(localizedOfferUnitTexts) !== JSON.stringify(englishOfferUnitTexts)) {
        fail(`Home JSON-LD offer unitText must preserve schema.org unit codes for ${locale}`)
    }

    const englishActions = englishHome.agentChatShowcase?.suggestions?.map((suggestion) => suggestion.action) ?? []
    const localizedActions = home.agentChatShowcase?.suggestions?.map((suggestion) => suggestion.action) ?? []
    if (JSON.stringify(localizedActions) !== JSON.stringify(englishActions)) {
        fail(`Home agent chat suggestion actions must preserve stable enum values for ${locale}`)
    }

    visitStringValues(home, (value, keyPath) => {
        if (locale !== "en" && locale !== "en-XA" && disallowedNonEnglishHomeExactValues.has(value)) {
            fail(`Home content contains high-visibility English UI fragment for ${locale}: ${keyPath.join(".")}`)
        }
        if (locale === "it" && disallowedItalianHomeExactValues.has(value)) {
            fail(`Italian home content contains known wrong-context UI translation: ${keyPath.join(".")}`)
        }
        if (/[:©]\{[A-Za-z_][A-Za-z0-9_]*\}/u.test(value)) {
            fail(`Home content placeholder is missing visible separator spacing for ${locale}: ${keyPath.join(".")}`)
        }
    })

    const serialized = JSON.stringify(home)
    if (locale === "it") {
        if (serialized.includes("e-mail")) fail("Italian home content must use email, not e-mail")
        if (/\bAI\b/u.test(serialized)) fail("Italian home content must use IA for standalone AI")
    }
    if (locale === "zh-Hant" && /[复动]/u.test(serialized)) {
        fail("Traditional Chinese home content contains known simplified-only characters")
    }
}

function assertLocalizedSeoValue(locale, relativePath, fieldName, localizedValue, englishValue) {
    if (locale === "en") return
    if (typeof localizedValue !== "string" || typeof englishValue !== "string") return
    if (localizedValue.trim() === englishValue.trim()) {
        fail(`High-visibility SEO field still equals English for ${locale}: ${relativePath} ${fieldName}`)
    }
}

function assertLayoutContracts() {
    const faqSource = readText("src/components/sections/FAQ.astro")
    if (!faqSource.includes("...faq.items") || !faqSource.includes("...verticalFaqs")) {
        fail("FAQ.astro must merge shared FAQ items with vertical-specific FAQ items")
    }

    const blogLayoutSource = readText("src/layouts/BlogLayout.astro")
    if (blogLayoutSource.includes('author !== "Chiefy Team"')) {
        fail("BlogLayout.astro must not suppress team bylines by comparing localized author display strings")
    }
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
        new RegExp(String.raw`https:\/\/chiefy\.com${routePathPattern}`, "gu"),
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
        "getAlternateLinksForRoute",
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
    assertLocaleScriptClassification(runtimeLocales)
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
        "astro.config.mjs",
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
    const astroConfig = readText("astro.config.mjs")
    if (!astroConfig.includes("filterSitemapPage") || !astroConfig.includes("hasBootstrapLocales")) {
        fail("astro.config.mjs must filter localized sitemap output while bootstrap locales exist")
    }
    runNodeScript("scripts/i18n/redirect-contracts.mjs", ["--check"])
}

async function assertSourceContentFiles({ complete }) {
    const localeSource = readJson("src/i18n/locales.source.json")
    // `--locales=` (or a list of only blanks) parses to [], which is neither
    // null nor undefined — so it would win the ?? and silently reduce every
    // per-locale check below to a no-op while still printing success.
    if (localeScopeArg !== undefined && (localeScope === undefined || localeScope.length === 0)) {
        fail("--locales was provided but empty; pass at least one locale or omit the flag")
    }
    const unknownScoped = (localeScope ?? []).filter((locale) => !localeSource.runtime_locales.includes(locale))
    if (unknownScoped.length) {
        fail(`--locales names locales that are not runtime locales: ${unknownScoped.join(", ")}`)
    }
    const locales = localeScope ?? localeSource.runtime_locales
    const legalPages = ["cookies", "disclaimer", "privacy", "terms"]
    const verticalFiles = listFiles("src/data/verticals", ".json")
    const englishBlogFiles = listFiles("src/content/blog/en", ".md")
    const englishMessages = readJson("src/i18n/messages/en.json")

    assertNoDuplicateTopLevelJsonKeys("src/i18n/messages/en.json")
    assertLayoutContracts()

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
        const englishLastUpdated = legalLastUpdated(`src/i18n/content/legal/en/${page}.html`)
        for (const locale of locales) {
            const localizedLastUpdated = legalLastUpdated(`src/i18n/content/legal/${locale}/${page}.html`)
            if (localizedLastUpdated !== englishLastUpdated) {
                fail(`Legal lastUpdated metadata must match English for ${locale}/${page}: ${localizedLastUpdated} !== ${englishLastUpdated}`)
            }
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
        assertNoDuplicateTopLevelJsonKeys(`src/i18n/messages/${locale}.json`)
        const messages = readJson(`src/i18n/messages/${locale}.json`)
        assertMessageKeyParity(locale, messages, englishMessages)
        assertMessagePlaceholderParity(locale, messages, englishMessages)
        assertMessageQualityContracts(locale, messages, englishMessages)
        assertNoProtectedTermGlueInValue(locale, `src/i18n/messages/${locale}.json`, messages)
        const home = readJson(`src/i18n/content/home/${locale}.json`)
        const englishHome = readJson("src/i18n/content/home/en.json")
        assertHomeStructureParity(locale, home, englishHome)
        assertHomeQualityContracts(locale, home, englishHome)
        assertNoRetiredBrand(locale, `src/i18n/content/home/${locale}.json`, home)
        assertNoRetiredBrand(locale, `src/i18n/messages/${locale}.json`, messages)
        assertNoProtectedTermGlueInValue(locale, `src/i18n/content/home/${locale}.json`, home)
        assertLocalizedSeoValue(locale, `src/i18n/content/home/${locale}.json`, "meta.title", home.meta?.title, englishHome.meta?.title)
        assertLocalizedSeoValue(locale, `src/i18n/content/home/${locale}.json`, "meta.description", home.meta?.description, englishHome.meta?.description)
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
            assertNoProtectedTermGlue(locale, `src/i18n/content/legal/${locale}/${page}.html`, legal)
            assertNoLegalArtifacts(`src/i18n/content/legal/${locale}/${page}.html`, legal)
            if (locale !== localeSource.default_locale) {
                assertNoHighVisibilityEnglishLegalLeftovers(`src/i18n/content/legal/${locale}/${page}.html`, legal)
            }
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
            const englishVertical = readJson(`src/i18n/content/verticals/en/${file}`)
            assertNoProtectedTermGlueInValue(locale, `src/i18n/content/verticals/${locale}/${file}`, vertical)
            assertLocalizedSeoValue(locale, `src/i18n/content/verticals/${locale}/${file}`, "pageTitle", vertical.pageTitle, englishVertical.pageTitle)
            assertLocalizedSeoValue(locale, `src/i18n/content/verticals/${locale}/${file}`, "metaDescription", vertical.metaDescription, englishVertical.metaDescription)
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
            const markdownContent = readText(relativePath)
            assertNoPublishedContentPlaceholders(relativePath, markdownContent)
            assertNoProtectedTermGlue(locale, relativePath, markdownContent)
            assertNoLongEnglishRuns(locale, relativePath, markdownContent)
            const { frontmatter: englishFrontmatter } = parseMarkdownFrontmatter(readText(`src/content/blog/en/${file}`), `src/content/blog/en/${file}`)
            assertLocalizedSeoValue(locale, relativePath, "title", frontmatterValue(frontmatter, "title")?.replace(/^"|"$/g, ""), frontmatterValue(englishFrontmatter, "title")?.replace(/^"|"$/g, ""))
            assertLocalizedSeoValue(locale, relativePath, "description", frontmatterValue(frontmatter, "description")?.replace(/^"|"$/g, ""), frontmatterValue(englishFrontmatter, "description")?.replace(/^"|"$/g, ""))
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
