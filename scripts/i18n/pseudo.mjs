#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
const fieldClassifications = JSON.parse(readFileSync(path.join(repoRoot, "src/i18n/fieldClassifications.json"), "utf8"))
const lockedStructuralPaths = new Set(fieldClassifications.lockedStructuralPaths ?? [])
const lockedLeafKeys = new Set(
    [...lockedStructuralPaths]
        .filter((jsonPath) => /^\$\.[A-Za-z0-9_@$-]+$/u.test(jsonPath))
        .map((jsonPath) => jsonPath.slice(2)),
)
const lockedValuePathPatterns = fieldClassifications.lockedValuePathPatterns ?? []

function pseudoString(value) {
    return `[!! ${value
        .replace(/[aeiou]/gi, (letter) => `${letter}${letter}`)
        .replace(/[A-Za-z]/g, (letter) => `${letter}`)} !!]`
}

function jsonPath(keyPath) {
    return `$${keyPath.map((segment) => (/^\d+$/u.test(segment) ? "[*]" : `.${segment}`)).join("")}`
}

function dottedPath(keyPath) {
    return keyPath.filter((segment) => !/^\d+$/u.test(segment)).join(".")
}

function lockedValuePatternMatches(keyPath) {
    const pathValue = dottedPath(keyPath)
    return lockedValuePathPatterns.some(
        (pattern) => pathValue === pattern || pathValue.endsWith(`.${pattern}`) || pathValue.includes(`${pattern}.`),
    )
}

function shouldPreserve(keyPath, value) {
    if (typeof value !== "string") return false
    const leaf = keyPath.at(-1)
    return lockedStructuralPaths.has(jsonPath(keyPath)) || lockedLeafKeys.has(leaf) || lockedValuePatternMatches(keyPath)
}

function pseudoValue(value, keyPath = []) {
    if (shouldPreserve(keyPath, value)) return value
    if (typeof value === "string") return pseudoString(value)
    if (Array.isArray(value)) return value.map((item, index) => pseudoValue(item, [...keyPath, String(index)]))
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, pseudoValue(nested, [...keyPath, key])]))
    }
    return value
}

function assertLockedValuesPreserved(source, target, keyPath = []) {
    if (shouldPreserve(keyPath, source) && source !== target) {
        throw new Error(`Pseudo-locale changed locked value at ${jsonPath(keyPath)}: ${source} !== ${target}`)
    }
    if (Array.isArray(source)) {
        for (let index = 0; index < source.length; index += 1) {
            assertLockedValuesPreserved(source[index], target?.[index], [...keyPath, String(index)])
        }
    } else if (source && typeof source === "object") {
        for (const [key, nested] of Object.entries(source)) {
            assertLockedValuesPreserved(nested, target?.[key], [...keyPath, key])
        }
    }
}

function writePseudo(sourceRelativePath, targetRelativePath) {
    const sourcePath = path.join(repoRoot, sourceRelativePath)
    const targetPath = path.join(repoRoot, targetRelativePath)
    if (!existsSync(sourcePath)) {
        console.log(`Skipping pseudo source that does not exist yet: ${sourceRelativePath}`)
        return
    }
    mkdirSync(path.dirname(targetPath), { recursive: true })
    const source = JSON.parse(readFileSync(sourcePath, "utf8"))
    const target = pseudoValue(source)
    assertLockedValuesPreserved(source, target)
    writeFileSync(targetPath, `${JSON.stringify(target, null, 2)}\n`)
    console.log(`Wrote ${targetRelativePath}`)
}

writePseudo("src/i18n/messages/en.json", "src/i18n/messages/en-XA.json")
writePseudo("src/i18n/content/home/en.json", "src/i18n/content/home/en-XA.json")
