import { defineCollection, z } from "astro:content"
import { glob } from "astro/loaders"

const blog = defineCollection({
    loader: glob({
        pattern: "**/*.md",
        base: "./src/content/blog",
        generateId: ({ entry }) => entry.replace(/\.md$/, ""),
    }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        publishedAt: z.coerce.date(),
        updatedAt: z.coerce.date().optional(),
        author: z.string().default("Chiefy Team"),
        authorType: z.enum(["team", "person"]).default("team"),
        coverImage: z.string().optional(),
        coverImageAlt: z.string().optional(),
        tags: z.array(z.string()).default([]),
        draft: z.boolean().default(false),
        translationStatus: z.enum(["bootstrap-en"]).optional(),
    }),
})

const help = defineCollection({
    loader: glob({
        pattern: "**/*.{md,mdx}",
        base: "./src/content/help",
        generateId: ({ entry }) => entry.replace(/\.mdx?$/, ""),
    }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        category: z.enum([
            "getting-started",
            "smart-drafts",
            "auto-labels",
            "smart-summaries",
            "ask-chiefy",
            "calendar",
            "connected-mailboxes",
            "privacy-security",
            "account-billing",
        ]),
        type: z.enum(["how-to", "concept", "troubleshooting", "faq"]).default("how-to"),
        order: z.number().default(100),
        keywords: z.array(z.string()).default([]),
        relatedSlugs: z.array(z.string()).default([]),
        updatedAt: z.coerce.date(),
        draft: z.boolean().default(false),
        translationStatus: z.enum(["bootstrap-en"]).optional(),
    }),
})

export const collections = { blog, help }
