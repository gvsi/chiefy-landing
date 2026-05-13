#!/usr/bin/env node
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
const stampDir = path.join(repoRoot, ".i18n-build")

function walkMtimeMax(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath)
    try {
        const stat = statSync(absolutePath)
        if (stat.isDirectory()) {
            if (["dist", ".astro", ".i18n-build", ".i18n-packets", ".wrangler", "node_modules"].includes(path.basename(absolutePath))) {
                return 0
            }
            return Math.max(0, ...readdirSync(absolutePath).map((entry) => walkMtimeMax(path.join(relativePath, entry))))
        }
        return stat.mtimeMs
    } catch {
        return 0
    }
}

function sourceMtimeMax() {
    return Math.max(
        ...[
            "astro.config.mjs",
            "package.json",
            "pnpm-lock.yaml",
            "tsconfig.json",
            "functions/tsconfig.json",
            "src",
            "public",
            "functions",
        ].map(walkMtimeMax),
    )
}

function writeStamp(name, data) {
    mkdirSync(stampDir, { recursive: true })
    writeFileSync(path.join(stampDir, name), `${JSON.stringify(data, null, 2)}\n`)
}

const startedAt = new Date().toISOString()
writeStamp("build-start.json", {
    startedAt,
    sourceMtimeMax: sourceMtimeMax(),
    command: "astro build",
})

const result = spawnSync("pnpm", ["exec", "astro", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
})

writeStamp("build-end.json", {
    startedAt,
    endedAt: new Date().toISOString(),
    sourceMtimeMax: sourceMtimeMax(),
    command: "astro build",
    exitCode: result.status ?? 1,
})

process.exit(result.status ?? 1)
