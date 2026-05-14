import type { Locale, RenderLocale } from "../i18n/locales"
import { type Messages, t } from "../i18n/messages/schema"

const WORDS_PER_MINUTE = 238
const CJK_CHARACTERS_PER_WORD = 2
const CJK_CHARACTER_LOCALES = new Set<RenderLocale>(["ja", "ko", "th", "zh-Hans", "zh-Hant"])

function stripContentForReadingTime(content: string): string {
    return content
        .replace(/```[\s\S]*?```/g, "") // Remove code blocks
        .replace(/`[^`]*`/g, "") // Remove inline code
        .replace(/!\[.*?\]\(.*?\)/g, "") // Remove images
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // Keep link text
        .replace(/<[^>]*>/g, "") // Remove HTML tags
        .replace(/[#*_~`]/g, "") // Remove markdown formatting
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim()
}

function countCharactersForLocale(text: string): number {
    return text.replace(/[\s\p{P}\p{S}]/gu, "").length
}

function fallbackWordCount(text: string, locale: RenderLocale): number {
    if (CJK_CHARACTER_LOCALES.has(locale)) {
        return Math.ceil(countCharactersForLocale(text) / CJK_CHARACTERS_PER_WORD)
    }
    return text.split(/\s+/).filter(Boolean).length
}

function countWordsForLocale(text: string, locale: RenderLocale): number {
    if (typeof Intl.Segmenter === "function") {
        const segmenter = new Intl.Segmenter(locale, { granularity: "word" })
        const wordLikeCount = [...segmenter.segment(text)].filter((segment) => segment.isWordLike).length
        if (wordLikeCount > 0) return wordLikeCount
    }
    return fallbackWordCount(text, locale)
}

export function calculateReadingTimeForLocale(content: string, locale: RenderLocale): number {
    const text = stripContentForReadingTime(content)
    const wordCount = countWordsForLocale(text, locale)
    const minutes = Math.ceil(wordCount / WORDS_PER_MINUTE)

    return Math.max(1, minutes)
}

export function calculateReadingTime(content: string): number {
    return calculateReadingTimeForLocale(content, "en")
}

export function formatReadingTime(minutes: number, messages?: Messages): string {
    if (!messages) return `${minutes} min read`
    return formatReadingTimeForLocale(minutes, "en", messages)
}

export function formatReadingTimeForLocale(minutes: number, locale: Locale, messages: Messages): string {
    const category = new Intl.PluralRules(locale).select(minutes)
    return t(messages, `readingTime.${category}`, { minutes })
}

export function formatDate(date: Date, locale: Locale): string {
    return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
    }).format(date)
}
