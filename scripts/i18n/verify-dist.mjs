#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
const distRoot = path.join(repoRoot, "dist")

function fail(message) {
    throw new Error(message)
}

function read(relativePath) {
    return readFileSync(path.join(repoRoot, relativePath), "utf8")
}

function assertCopiedRoutesManifest() {
    const source = read("public/_routes.json")
    const targetPath = path.join(distRoot, "_routes.json")
    if (!existsSync(targetPath)) fail("dist/_routes.json is missing")
    const target = readFileSync(targetPath, "utf8")
    if (source.trim() !== target.trim()) fail("dist/_routes.json drifted from public/_routes.json")
}

function listFiles(dir, suffix, out = []) {
    if (!existsSync(dir)) return out
    for (const entry of readdirSync(dir)) {
        const absolutePath = path.join(dir, entry)
        const stat = statSync(absolutePath)
        if (stat.isDirectory()) listFiles(absolutePath, suffix, out)
        else if (absolutePath.endsWith(suffix)) out.push(absolutePath)
    }
    return out
}

function assertJsonLdParses() {
    for (const filePath of listFiles(distRoot, ".html")) {
        const html = readFileSync(filePath, "utf8")
        for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
            try {
                JSON.parse(match[1])
            } catch (error) {
                fail(`Invalid JSON-LD in ${path.relative(repoRoot, filePath)}: ${error.message}`)
            }
        }
    }
}

try {
    if (!existsSync(distRoot)) fail("dist/ is missing; run pnpm build or pnpm i18n:build first")
    assertCopiedRoutesManifest()
    assertJsonLdParses()
    console.log("i18n dist verification passed")
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
}
