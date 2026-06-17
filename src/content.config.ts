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

export const collections = { blog }
