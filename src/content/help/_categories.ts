export type HelpCategory = { id: string; name: string; blurb: string; iconKey: string; order: number }

export const HELP_CATEGORIES: HelpCategory[] = [
    {
        id: "getting-started",
        name: "Getting started",
        blurb: "Install the extension, connect your inbox, and send your first draft.",
        iconKey: "rocket",
        order: 10,
    },
    {
        id: "smart-drafts",
        name: "Smart Drafts",
        blurb: "Reply and write in your voice — on demand, or automatically with Autodraft.",
        iconKey: "pen",
        order: 20,
    },
    {
        id: "auto-labels",
        name: "Auto Labels",
        blurb: "Chiefy sorts every email into the right label automatically — no rules.",
        iconKey: "labels",
        order: 30,
    },
    {
        id: "smart-summaries",
        name: "Smart Summaries",
        blurb: "One-tap TL;DR of any thread, email, or attachment.",
        iconKey: "summary",
        order: 40,
    },
    {
        id: "ask-chiefy",
        name: "Ask Chiefy",
        blurb: "Chat with Chiefy and ask questions across your inbox and calendar.",
        iconKey: "chat",
        order: 50,
    },
    {
        id: "calendar",
        name: "Calendar Integration",
        blurb: "Scheduling, availability, and how Chiefy uses your calendar in drafts.",
        iconKey: "calendar",
        order: 60,
    },
    {
        id: "connected-mailboxes",
        name: "Connected Mailboxes",
        blurb: "Add and manage multiple Gmail and Outlook accounts under one login.",
        iconKey: "mailboxes",
        order: 70,
    },
    {
        id: "privacy-security",
        name: "Privacy & security",
        blurb: "OAuth scopes, encryption, and what Chiefy never does with your mail.",
        iconKey: "shield",
        order: 80,
    },
    {
        id: "account-billing",
        name: "Account & billing",
        blurb: "Plans, your free trial, invoices, and cancellation.",
        iconKey: "card",
        order: 90,
    },
]

export const helpCategory = (id: string) => HELP_CATEGORIES.find((c) => c.id === id)
