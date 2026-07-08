import { LANDING_SECURITY_HEADERS } from "../redirectCore.mjs"

const CODE_RE = /^[a-z0-9]{4,16}$/

export const onRequest: PagesFunction<Env> = async ({ params, request }) => {
    const raw = String(params.code ?? "").toLowerCase()
    const origin = new URL(request.url).origin
    const target = CODE_RE.test(raw) ? `${origin}/refer?ref=${raw}` : `${origin}/refer`
    return new Response(null, {
        status: 302,
        headers: { Location: target, ...LANDING_SECURITY_HEADERS },
    })
}
