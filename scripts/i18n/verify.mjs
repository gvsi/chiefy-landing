#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs"
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
    for (const locale of locales) {
        assertFile(`src/i18n/messages/${locale}.json`)
        assertFile(`src/i18n/content/home/${locale}.json`)
        for (const page of ["cookies", "disclaimer", "privacy", "terms"]) {
            assertFile(`src/i18n/content/legal/${locale}/${page}.html`)
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
