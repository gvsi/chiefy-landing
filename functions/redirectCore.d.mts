export const LANDING_SECURITY_HEADERS: Record<string, string>
export const LANDING_HEADER_UNSETS: readonly string[]
export function resolveRuntimeLocale(raw: string): string
export function computeCanonicalRedirect(request: Request): string | null
export function redirectResponse(location: string, status?: number): Response
export function wrapResponseWithSecurityHeaders(response: Response): Response
export function handleLandingRequest(request: Request, next: () => Promise<Response>): Promise<Response>
