export function serializeJsonLd(value: unknown): string {
    return JSON.stringify(value).replace(/</g, "\\u003c")
}

export function escapeHtmlAttribute(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
}

export function jsonLdScript(value: unknown): string {
    return `<script type="application/ld+json">${serializeJsonLd(value)}</script>`
}
