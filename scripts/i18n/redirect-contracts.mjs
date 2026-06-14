#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import {
    LANDING_HEADER_UNSETS,
    LANDING_SECURITY_HEADERS,
    computeCanonicalRedirect,
    computeFlipRedirect,
    handleLandingRequest,
} from "../../functions/redirectCore.mjs"

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
const args = new Set(process.argv.slice(2))
const fixturePath = path.join(repoRoot, "scripts/i18n/fixtures/redirect-contracts.json")

function fail(message) {
    throw new Error(message)
}

function readJson(relativePath) {
    return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"))
}

function fixtureOutput() {
    const fixtures = readJson("scripts/i18n/fixtures/redirect-contracts.json")
    return {
        schemaVersion: fixtures.schemaVersion,
        redirects: fixtures.redirects.map((fixture) => {
            const request = new Request(fixture.input)
            const location = computeCanonicalRedirect(request)
            return {
                ...fixture,
                status: location ? 301 : 200,
                location,
            }
        }),
    }
}

async function assertFixtures() {
    const expected = readJson("scripts/i18n/fixtures/redirect-contracts.json")
    const actual = fixtureOutput()
    if (JSON.stringify(actual, null, 2) !== JSON.stringify(expected, null, 2)) {
        if (args.has("--write-fixtures")) {
            writeFileSync(fixturePath, `${JSON.stringify(actual, null, 2)}\n`)
            console.log("Updated redirect fixtures")
            return
        }
        fail("Redirect fixtures drifted. Run node scripts/i18n/redirect-contracts.mjs --write-fixtures if intentional.")
    }

    const redirectResponse = await handleLandingRequest(new Request("https://duetmail.com/pt"), {}, async () => new Response("ok"))
    assertSecurityHeaders(redirectResponse, "redirect response")

    const passThroughResponse = await handleLandingRequest(
        new Request("https://duetmail.com/de"),
        {},
        async () =>
            new Response("ok", {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    Server: "example",
                    "X-Keep": "yes",
                },
            }),
    )
    assertSecurityHeaders(passThroughResponse, "pass-through response")
    if (passThroughResponse.headers.get("X-Keep") !== "yes") fail("Pass-through response did not preserve unrelated header")
}

async function assertFlipRedirects() {
    // FLIP_301 ON: duetmail.com / www.duetmail.com → chiefy.com, canonical path + query preserved.
    const flipOn = { FLIP_301: "on" }
    const flipCases = [
        ["https://duetmail.com/for/sales?x=1", "https://chiefy.com/for/sales?x=1"],
        ["https://www.duetmail.com/blog/x", "https://chiefy.com/blog/x"],
        // Non-legal SUBpaths must STILL flip (proves parts.length === offset + 1 exactness).
        ["https://duetmail.com/privacy/foo", "https://chiefy.com/privacy/foo"],
        ["https://duetmail.com/pt-BR/terms/old", "https://chiefy.com/pt-BR/terms/old"],
    ]
    for (const [input, expected] of flipCases) {
        const location = computeFlipRedirect(new Request(input), flipOn)
        if (location !== expected) fail(`FLIP_301 on: ${input} → expected ${expected}, got ${location}`)
        const response = await handleLandingRequest(new Request(input), flipOn, async () => new Response("ok"))
        if (response.status !== 301) fail(`FLIP_301 on: ${input} expected 301, got ${response.status}`)
        if (response.headers.get("Location") !== expected) {
            fail(`FLIP_301 on: ${input} Location expected ${expected}, got ${response.headers.get("Location")}`)
        }
        assertSecurityHeaders(response, `flip response ${input}`)
    }

    // FLIP_301 ON: legal pages (across aliases/.html/locale prefixes) are EXEMPT — no flip.
    const legalExempt = [
        "https://duetmail.com/privacy",
        "https://duetmail.com/pt-BR/terms",
        "https://duetmail.com/pt/privacy",
        "https://duetmail.com/privacy.html",
    ]
    for (const input of legalExempt) {
        const location = computeFlipRedirect(new Request(input), flipOn)
        if (location !== null) fail(`FLIP_301 on: legal ${input} must NOT flip, got ${location}`)
    }

    // FLIP_301 ON: non-duetmail hosts (e.g. chiefy.com itself) → no flip.
    if (computeFlipRedirect(new Request("https://chiefy.com/"), flipOn) !== null) {
        fail("FLIP_301 on: chiefy.com must NOT flip")
    }

    // FLIP_301 OFF (env={} / absent flag): no flip anywhere.
    for (const [input] of flipCases) {
        if (computeFlipRedirect(new Request(input), {}) !== null) fail(`FLIP_301 off: ${input} must NOT flip`)
    }
    if (computeFlipRedirect(new Request("https://duetmail.com/for/sales"), { FLIP_301: "off" }) !== null) {
        fail("FLIP_301='off': must NOT flip")
    }
}

function assertSecurityHeaders(response, label) {
    for (const [name, value] of Object.entries(LANDING_SECURITY_HEADERS)) {
        if (response.headers.get(name) !== value) {
            fail(`${label} missing security header ${name}`)
        }
    }
    for (const name of LANDING_HEADER_UNSETS) {
        if (response.headers.has(name)) fail(`${label} did not delete ${name}`)
    }
}

function assertHeadersMirror() {
    const headersSource = readFileSync(path.join(repoRoot, "public/_headers"), "utf8")
    for (const [name, value] of Object.entries(LANDING_SECURITY_HEADERS)) {
        if (!headersSource.includes(`${name}: ${value}`)) fail(`public/_headers drifted from LANDING_SECURITY_HEADERS: ${name}`)
    }
    for (const name of LANDING_HEADER_UNSETS) {
        if (!headersSource.includes(`! ${name}`)) fail(`public/_headers drifted from LANDING_HEADER_UNSETS: ${name}`)
    }
}

function assertRoutesManifest() {
    const routes = readJson("public/_routes.json")
    for (const pattern of ["/_astro/*", "/blog/images/*", "/*.webp", "/*.png", "/favicon.svg"]) {
        if (!routes.exclude.includes(pattern)) fail(`public/_routes.json missing asset exclusion: ${pattern}`)
    }
}

function assertRedirectsStaticFile() {
    const redirectsSource = readFileSync(path.join(repoRoot, "public/_redirects"), "utf8")
    const forbiddenSources = ["/terms/", "/privacy/", "/cookies/", "/disclaimer/", "/blog/", "/blog/*/"]
    for (const source of forbiddenSources) {
        if (redirectsSource.includes(source)) fail(`public/_redirects still contains Function-owned route: ${source}`)
    }
}

function assertFunctionsBuild() {
    const routesPath = path.join(repoRoot, ".wrangler/pages-functions/_routes.json")
    if (!existsSync(routesPath)) fail("Wrangler Functions build did not emit .wrangler/pages-functions/_routes.json")
    const adapterSource = readFileSync(path.join(repoRoot, "functions/[[path]].ts"), "utf8")
    if (!adapterSource.includes("./redirectCore.mjs")) fail("Catch-all Function does not import shared redirectCore.mjs")
}

try {
    await assertFixtures()
    await assertFlipRedirects()
    assertHeadersMirror()
    assertRoutesManifest()
    assertRedirectsStaticFile()
    if (args.has("--check-functions-build")) assertFunctionsBuild()
    console.log("redirect contracts passed")
} catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
}
