#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
const localSourcePath = path.join(repoRoot, "src/i18n/locales.source.json")
const localesTsPath = path.join(repoRoot, "src/i18n/locales.ts")
const args = new Set(process.argv.slice(2))
const rootArg = process.argv.find((arg) => arg.startsWith("--root="))

function readJson(filePath) {
    return JSON.parse(readFileSync(filePath, "utf8"))
}

function stableJson(value) {
    return `${JSON.stringify(value, null, 2)}\n`
}

function selectContract(source) {
    return {
        schema_version: source.schema_version,
        source_locale: source.source_locale,
        default_locale: source.default_locale,
        runtime_locales: source.runtime_locales,
        excluded_rtl_locales: source.excluded_rtl_locales,
        locale_aliases: source.locale_aliases,
        pseudo_locales: source.pseudo_locales,
        normalization: source.normalization,
    }
}

function walkForRoot(start) {
    let current = path.resolve(start)
    while (true) {
        const candidate = path.join(current, "docs/i18n/locales.json")
        if (existsSync(candidate)) return candidate
        const next = path.dirname(current)
        if (next === current) return null
        current = next
    }
}

function resolveRootLocalesPath() {
    if (rootArg) {
        return path.resolve(rootArg.slice("--root=".length), "docs/i18n/locales.json")
    }
    if (process.env.DUET_REPO_ROOT) {
        return path.resolve(process.env.DUET_REPO_ROOT, "docs/i18n/locales.json")
    }
    const scriptDir = path.dirname(fileURLToPath(import.meta.url))
    const found = walkForRoot(process.cwd()) ?? walkForRoot(scriptDir)
    if (found) return found
    throw new Error(
        "Unable to locate docs/i18n/locales.json. Pass --root=<duet repo root> or set DUET_REPO_ROOT.",
    )
}

function normalizeContract(contract) {
    if (!Array.isArray(contract.runtime_locales) || contract.default_locale !== "en") {
        throw new Error("Invalid locale contract: expected runtime_locales and default_locale=en")
    }
    if (!contract.runtime_locales.includes(contract.default_locale)) {
        throw new Error("Invalid locale contract: default locale is missing from runtime locales")
    }
    for (const locale of contract.excluded_rtl_locales ?? []) {
        if (contract.runtime_locales.includes(locale)) {
            throw new Error(`Invalid locale contract: excluded RTL locale ${locale} is supported`)
        }
    }
    return contract
}

function extractArrayConst(source, name) {
    const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`))
    if (!match) throw new Error(`Unable to find ${name} in src/i18n/locales.ts`)
    return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1])
}

function extractAliasObject(source) {
    const match = source.match(/export const LOCALE_ALIASES: Record<string, Locale> = \{([\s\S]*?)\n\}/)
    if (!match) throw new Error("Unable to find LOCALE_ALIASES in src/i18n/locales.ts")
    return Object.fromEntries(
        [...match[1].matchAll(/"([^"]+)": "([^"]+)"/g)].map((entry) => [entry[1], entry[2]]),
    )
}

function expectedNormalization(contract) {
    const normalization = contract.normalization
    return {
        convertUnderscoresToHyphens: normalization.convert_underscores_to_hyphens,
        lowercaseLanguageSubtags: normalization.lowercase_language_subtags,
        titlecaseScriptSubtags: normalization.titlecase_script_subtags,
        uppercaseRegionSubtags: normalization.uppercase_region_subtags,
        stripSingletonTailsBeforeMatching: normalization.strip_singleton_tails_before_matching,
        candidateOrder: normalization.candidate_order,
        candidateResolutionOrder: normalization.candidate_resolution_order,
        defaultAfterAllCandidates: normalization.default_after_all_candidates,
        aliasAppliesPerCandidateBeforeNextCandidate:
            normalization.alias_applies_per_candidate_before_next_candidate,
        malformedTagsIgnoredBeforeBaseFallback: normalization.malformed_tags_ignored_before_base_fallback,
    }
}

function assertEqual(actual, expected, label) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${label} drifted\nexpected: ${JSON.stringify(expected)}\nactual: ${JSON.stringify(actual)}`)
    }
}

function verifyLocalesTs(contract) {
    const source = readFileSync(localesTsPath, "utf8")
    assertEqual(extractArrayConst(source, "SUPPORTED_LOCALES"), contract.runtime_locales, "SUPPORTED_LOCALES")
    assertEqual(Object.keys(extractAliasObject(source)), Object.keys(contract.locale_aliases), "LOCALE_ALIASES keys")
    assertEqual(extractAliasObject(source), contract.locale_aliases, "LOCALE_ALIASES")
    const pseudoLocales = Object.keys(contract.pseudo_locales ?? {})
    assertEqual(extractArrayConst(source, "PSEUDO_LOCALES"), pseudoLocales, "PSEUDO_LOCALES")
    const expected = expectedNormalization(contract)
    for (const [key, value] of Object.entries(expected)) {
        const serialized = JSON.stringify(value)
        const flexibleSerialized = serialized.replaceAll("[", "\\[\\s*").replaceAll("]", "\\s*\\]").replaceAll(",", "\\s*,\\s*")
        const pattern = new RegExp(`${key}:\\s*${flexibleSerialized}`)
        if (!pattern.test(source)) {
            throw new Error(`LOCALE_NORMALIZATION.${key} drifted`)
        }
    }
}

function compareMirror(rootContract) {
    const localContract = normalizeContract(readJson(localSourcePath))
    assertEqual(localContract, rootContract, "src/i18n/locales.source.json")
}

function updateMirror(rootContract) {
    writeFileSync(localSourcePath, stableJson(rootContract))
}

try {
    if (args.has("--from-root")) {
        const rootContract = normalizeContract(selectContract(readJson(resolveRootLocalesPath())))
        if (args.has("--write")) {
            updateMirror(rootContract)
            verifyLocalesTs(rootContract)
        } else {
            compareMirror(rootContract)
        }
    }

    const localContract = normalizeContract(readJson(localSourcePath))
    verifyLocalesTs(localContract)
    console.log("i18n locale source is in sync")
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
}
