// Help-page-only English UI strings (two-tier i18n model, see plan Task 1.0 / 1.6).
//
// These strings are consumed DIRECTLY by help components and layouts — NOT through
// the message catalog `t()`. Keeping them here avoids adding ~20 help.* keys to every
// `src/i18n/messages/{locale}.json` (key parity is enforced across all ~48 locales) and
// avoids any locale-wide bootstrap marker. The single shared Nav/Footer link label
// (`help.nav.label`) lives in the catalog instead.
//
// When help is localized later, this module gains per-locale variants.

export type HelpSymptom = {
    title: string
    description: string
    /** Optional link to the fixing article (added as the corpus lands in Phase 6). */
    href?: string
}

export const HELP_UI = {
    hero: {
        eyebrow: "Help center",
        title: "How can we",
        titleHighlight: "help?",
        subtitle: "Guides and answers for getting the most out of Chiefy.",
    },
    search: {
        // SearchModal input placeholder
        placeholder: "Search the help center…",
        // Hero search/ask toggle
        searchTab: "Search",
        askTab: "Ask Chiefy",
        soon: "soon",
        // Hero search bar prompt (longer, sets expectations for what's searchable)
        barPlaceholder: "Search for answers — Smart Drafts, Auto Labels, scheduling, connecting Gmail…",
        // Inline "Popular:" prefix under the hero search bar
        popular: "Popular:",
        // Top-results group label + the deferred "ask" row inside the modal
        topResults: "Top results",
        askThisQuestion: "Ask Chiefy this question",
        navigate: "navigate",
        open: "open",
        close: "close",
        // Legacy field retained for any earlier consumers
        askSoon: "Ask Chiefy · soon",
    },
    browseByTopic: "Browse by topic",
    articlesLabel: "articles",
    troubleshooting: {
        title: "Troubleshooting",
        subtitle: "Quick fixes for the things that come up most.",
        symptoms: [
            {
                title: "Chiefy isn't drafting replies",
                description: "Check that the extension is enabled and your inbox is connected, then reopen the thread.",
            },
            {
                title: "Auto Labels aren't appearing",
                description: "New labels apply as email arrives — give recent mail a moment, and confirm Auto Labels is on.",
            },
            {
                title: "A connected mailbox stopped syncing",
                description: "Reconnect the account from Connected Mailboxes to refresh its access.",
            },
            {
                title: "Smart Summaries look incomplete",
                description: "Very long threads can take a few seconds to summarize. Reopen the thread to retry.",
            },
        ] as HelpSymptom[],
    },
    contact: {
        title: "Still need a hand?",
        subtitle: "We read every message and usually reply the same day.",
        cta: "Email support",
        // Trust strip under the contact CTAs (matches landing security claims).
        trust: "Google CASA-assessed · Encrypted at rest · Secure OAuth 2.0",
    },
    article: {
        tldr: "TL;DR",
        wasHelpful: "Was this helpful?",
        yes: "Yes",
        no: "No",
        related: "Related articles",
        onThisPage: "On this page",
        updated: "Updated",
    },
    breadcrumb: {
        home: "Help center",
    },
} as const

export type HelpUi = typeof HELP_UI
