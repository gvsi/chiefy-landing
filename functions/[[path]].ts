import { handleLandingRequest } from "./redirectCore.mjs"

export const onRequest: PagesFunction<Env> = async (context) =>
    handleLandingRequest(context.request, () => context.next())
