#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
if (!existsSync(path.join(repoRoot, "src/i18n/messages/en.json"))) {
    console.log("i18n source scan skipped until English message extraction exists")
    process.exit(0)
}
const glossary = JSON.parse(readFileSync(path.join(repoRoot, "src/i18n/glossary.source.json"), "utf8"))
const allowedTerms = new Set(glossary.locked_terms)
const scanRoots = ["src/pages", "src/layouts", "src/components"]
const ignoredFragments = [
    "class=",
    "import ",
    "from ",
    "href=",
    "src=",
    "aria-hidden",
    "viewBox",
    "stroke",
    "fill",
    "currentColor",
]

function listFiles(dir, out = []) {
    const absolute = path.join(repoRoot, dir)
    if (!existsSync(absolute)) return out
    for (const entry of readdirSync(absolute)) {
        const filePath = path.join(absolute, entry)
        const stat = statSync(filePath)
        if (stat.isDirectory()) listFiles(path.relative(repoRoot, filePath), out)
        else if (/\.(astro|ts|tsx|js|jsx)$/.test(entry)) out.push(filePath)
    }
    return out
}

function likelyUserString(value) {
    const trimmed = value.trim()
    if (trimmed.length < 4) return false
    if (!/[A-Za-z]/.test(trimmed)) return false
    if (allowedTerms.has(trimmed)) return false
    if (/^[a-z0-9_.:-]+$/.test(trimmed)) return false
    if (/^https?:\/\//.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("#")) return false
    return true
}

const findings = []
for (const filePath of scanRoots.flatMap((root) => listFiles(root))) {
    const relative = path.relative(repoRoot, filePath)
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/)
    lines.forEach((line, index) => {
        if (ignoredFragments.some((fragment) => line.includes(fragment))) return
        for (const match of line.matchAll(/(?:>|["'`])([^"'`<>{}]*\b[A-Z][A-Za-z][^"'`<>{}]*)/g)) {
            const value = match[1]
            if (likelyUserString(value)) findings.push(`${relative}:${index + 1}: ${value.trim()}`)
        }
    })
}

if (findings.length > 0) {
    console.error("Potential hardcoded user-facing English strings:")
    console.error(findings.slice(0, 200).join("\n"))
    process.exit(1)
}

console.log("i18n source scan passed")
