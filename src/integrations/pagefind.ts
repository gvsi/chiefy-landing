import { fileURLToPath } from "node:url"
import type { AstroIntegration } from "astro"

/**
 * Pagefind integration — builds a static search index over the FINISHED build
 * output in `astro:build:done`, after every page (including the help articles)
 * has been written to disk.
 *
 * Scope: the index is restricted to help articles by the `data-pagefind-body`
 * attribute that lives ONLY on the article prose region (HelpArticleLayout).
 * Pagefind's contract is "if any indexed page declares `data-pagefind-body`,
 * only pages that declare it are indexed" — so the home/category/blog/marketing
 * pages (which have no such attribute) are excluded automatically. We therefore
 * do not need a per-page allow/deny list here.
 *
 * Output: `<dist>/pagefind/` (including `pagefind.js`), consumed at runtime by
 * the help SearchModal via a lazy `import("/pagefind/pagefind.js")`.
 *
 * Note: Pagefind only runs against built output, so search is unavailable under
 * `astro dev` — that is expected; use `astro build && astro preview` to exercise
 * it. The Node API is used (instead of spawning the CLI) for typed error
 * surfacing and to avoid an extra `npx` resolution step.
 */
export default function pagefind(): AstroIntegration {
    return {
        name: "duet-help-pagefind",
        hooks: {
            "astro:build:done": async ({ dir, logger }) => {
                const outputDir = fileURLToPath(dir)

                // Dynamic import keeps the (CJS-bridged) Pagefind service off the
                // config-load path and only pays the cost during a real build.
                const pagefindModule = await import("pagefind")

                const { index } = await pagefindModule.createIndex()
                if (!index) {
                    logger.warn("Pagefind could not create an index; search index was not generated")
                    return
                }

                // `page_count` here is the number of HTML files Pagefind *crawled*
                // (the whole site), not the number it *indexed*. Because
                // `data-pagefind-body` lives only on help articles, only those make
                // it into the index — verify via `dist/pagefind/pagefind-entry.json`.
                const { errors: indexErrors } = await index.addDirectory({ path: outputDir })
                if (indexErrors.length > 0) {
                    for (const message of indexErrors) logger.error(`Pagefind index error: ${message}`)
                    throw new Error("Pagefind failed to index the build output")
                }

                const { errors: writeErrors } = await index.writeFiles({
                    outputPath: fileURLToPath(new URL("pagefind/", dir)),
                })
                if (writeErrors.length > 0) {
                    for (const message of writeErrors) logger.error(`Pagefind write error: ${message}`)
                    throw new Error("Pagefind failed to write the search index")
                }

                await pagefindModule.close()
                logger.info("Pagefind search index written → pagefind/ (scoped to help articles via data-pagefind-body)")
            },
        },
    }
}
