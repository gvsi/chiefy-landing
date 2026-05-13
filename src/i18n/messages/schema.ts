import type { RenderLocale } from "../locales"

const messageModules = import.meta.glob("./*.json", { eager: true })

export type Messages = Record<string, string>

export function getMessages(locale: RenderLocale): Messages {
    const module = messageModules[`./${locale}.json`] as { default?: Messages } | undefined
    if (!module?.default) {
        throw new Error(`Missing messages for locale: ${locale}`)
    }
    return module.default
}

export function t(messages: Messages, key: string, values: Record<string, string | number> = {}): string {
    const template = messages[key]
    if (typeof template !== "string") {
        throw new Error(`Missing i18n message key: ${key}`)
    }
    return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, token) =>
        Object.prototype.hasOwnProperty.call(values, token) ? String(values[token]) : match,
    )
}
