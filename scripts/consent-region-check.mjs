// Contract check for resolveConsentRegion (functions/redirectCore.mjs).
// The cookie-consent banner shows ONLY where legally required (EEA + UK), driven
// by this region mapping over Cloudflare's CF-IPCountry. A regression here is a
// compliance issue, so we assert the mapping on every build.
//
// Run: node scripts/consent-region-check.mjs  (wired into `pnpm functions:build`)

import { resolveConsentRegion } from "../functions/redirectCore.mjs"

function req(country) {
    return { headers: { get: (key) => (key.toLowerCase() === "cf-ipcountry" ? country : null) } }
}

const cases = [
    // EEA / UK → eea (banner shown)
    ["FR", "eea"], ["DE", "eea"], ["IE", "eea"], ["IT", "eea"], ["ES", "eea"],
    ["SE", "eea"], ["PL", "eea"], ["NL", "eea"], ["GB", "eea"],
    ["NO", "eea"], ["IS", "eea"], ["LI", "eea"], // EEA non-EU
    ["fr", "eea"], // value is case-insensitive
    // Non-EEA → non-eea (banner hidden). NOTE: Switzerland (CH) is NOT EEA — its
    // nFADP is separate; treated as non-eea unless legal asks otherwise.
    ["US", "non-eea"], ["CA", "non-eea"], ["BR", "non-eea"], ["JP", "non-eea"],
    ["AU", "non-eea"], ["IN", "non-eea"], ["CH", "non-eea"], ["us", "non-eea"],
    // Unknown / missing → eea (FAIL-SAFE: never under-show where required)
    [null, "eea"], ["", "eea"], ["XX", "eea"], ["T1", "eea"],
]

let failed = 0
for (const [country, expected] of cases) {
    const got = resolveConsentRegion(req(country))
    if (got !== expected) {
        console.error(`FAIL: CF-IPCountry=${JSON.stringify(country)} → "${got}", expected "${expected}"`)
        failed += 1
    }
}

if (failed > 0) {
    console.error(`consent-region-check: ${failed} failure(s)`)
    process.exit(1)
}
console.log(`consent-region-check: all ${cases.length} cases pass`)
