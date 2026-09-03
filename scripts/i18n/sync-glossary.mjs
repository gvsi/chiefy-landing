#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
const localSourcePath = path.join(repoRoot, "src/i18n/glossary.source.json")
const args = new Set(process.argv.slice(2))
const rootArg = process.argv.find((arg) => arg.startsWith("--root="))

const providerTerms = [
    "Gmail",
    "Outlook",
    "Google",
    "Microsoft",
    "Stripe",
    "Amazon Web Services",
    "AWS",
    "Amazon ElastiCache",
    "Amazon EBS",
    "Amazon S3",
]
const claimSensitiveTerms = ["billing", "compliance", "pricing", "privacy", "security", "trial"]
const lockedTermOrder = [
    "Duet Mail",
    "Duet",
    "Gmail",
    "Outlook",
    "Google",
    "Microsoft",
    "Smart Drafts",
    "autodraft",
    "Stripe",
    "Pro",
]

function readJson(filePath) {
    return JSON.parse(readFileSync(filePath, "utf8"))
}

function walkForRoot(start) {
    let current = path.resolve(start)
    while (true) {
        const glossary = path.join(current, "docs/i18n/glossary.md")
        const checklist = path.join(current, "docs/i18n/user-facing-string-change-checklist.md")
        if (existsSync(glossary) && existsSync(checklist)) return current
        const next = path.dirname(current)
        if (next === current) return null
        current = next
    }
}

function resolveRoot() {
    if (rootArg) return path.resolve(rootArg.slice("--root=".length))
    if (process.env.DUET_REPO_ROOT) return path.resolve(process.env.DUET_REPO_ROOT)
    const scriptDir = path.dirname(fileURLToPath(import.meta.url))
    const found = walkForRoot(process.cwd()) ?? walkForRoot(scriptDir)
    if (found) return found
    throw new Error(
        "Unable to locate docs/i18n/glossary.md. Pass --root=<duet repo root> or set DUET_REPO_ROOT.",
    )
}

function termsFromDocs(root) {
    const glossary = readFileSync(path.join(root, "docs/i18n/glossary.md"), "utf8")
    const checklist = readFileSync(path.join(root, "docs/i18n/user-facing-string-change-checklist.md"), "utf8")
    const terms = new Set()
    for (const match of glossary.matchAll(/^\| ([^|]+) \| ([^|]+) \|$/gm)) {
        const term = match[1].trim()
        const rule = match[2].trim()
        if (term !== "English" && /Do not translate|Translate conceptually/i.test(rule)) terms.add(term)
    }
    for (const term of ["Duet Mail", "Duet", "Gmail", "Outlook", "Google", "Microsoft", "Stripe", "Pro"]) {
        if (checklist.includes(term) || glossary.includes(term)) terms.add(term)
    }
    const orderedTerms = [
        ...lockedTermOrder.filter((term) => terms.has(term)),
        ...[...terms].filter((term) => !lockedTermOrder.includes(term)).sort(),
    ]
    return {
        schema_version: 1,
        locked_terms: orderedTerms,
        provider_terms: providerTerms,
        claim_sensitive_terms: claimSensitiveTerms,
    }
}

function verifyShape(source) {
    for (const key of ["locked_terms", "provider_terms", "claim_sensitive_terms"]) {
        if (!Array.isArray(source[key])) throw new Error(`glossary.source.json missing array ${key}`)
    }
    for (const term of ["Duet Mail", "Duet", "Gmail", "Outlook", "Google", "Microsoft", "Stripe", "Pro"]) {
        if (!source.locked_terms.includes(term)) throw new Error(`Missing locked glossary term: ${term}`)
    }
}

function assertEqual(actual, expected, label) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${label} drifted\nexpected: ${JSON.stringify(expected)}\nactual: ${JSON.stringify(actual)}`)
    }
}

try {
    if (args.has("--from-root")) {
        const fromRoot = termsFromDocs(resolveRoot())
        if (args.has("--write")) {
            writeFileSync(localSourcePath, `${JSON.stringify(fromRoot, null, 2)}\n`)
        } else {
            assertEqual(readJson(localSourcePath), fromRoot, "src/i18n/glossary.source.json")
        }
    }

    verifyShape(readJson(localSourcePath))
    console.log("i18n glossary source is in sync")
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
}
