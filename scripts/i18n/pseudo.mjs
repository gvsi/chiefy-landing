#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))

function pseudoString(value) {
    return `[!! ${value
        .replace(/[aeiou]/gi, (letter) => `${letter}${letter}`)
        .replace(/[A-Za-z]/g, (letter) => `${letter}`)} !!]`
}

function pseudoValue(value, keyPath = []) {
    if (typeof value === "string") return pseudoString(value)
    if (Array.isArray(value)) return value.map((item, index) => pseudoValue(item, [...keyPath, String(index)]))
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, nested]) => {
                if (key === "action" && typeof nested === "string") return [key, nested]
                return [key, pseudoValue(nested, [...keyPath, key])]
            }),
        )
    }
    return value
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
    writeFileSync(targetPath, `${JSON.stringify(pseudoValue(source), null, 2)}\n`)
    console.log(`Wrote ${targetRelativePath}`)
}

writePseudo("src/i18n/messages/en.json", "src/i18n/messages/en-XA.json")
writePseudo("src/i18n/content/home/en.json", "src/i18n/content/home/en-XA.json")
