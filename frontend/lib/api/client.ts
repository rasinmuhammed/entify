const DEFAULT_API_BASE_URL = "http://localhost:8000"

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE_URL

function withTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`
}

export function buildApiUrl(
  path: string,
  searchParams?: Record<string, string | number | boolean | null | undefined>
) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path
  const url = new URL(normalizedPath, withTrailingSlash(API_BASE_URL))

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null || value === "") continue
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

async function parseError(response: Response) {
  const contentType = response.headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    const body = await response.json()
    return body.detail || body.error || JSON.stringify(body)
  }

  const body = await response.text()
  return body || `Request failed with status ${response.status}`
}

export async function fetchApiJson<T>(
  path: string,
  init?: RequestInit,
  searchParams?: Record<string, string | number | boolean | null | undefined>
): Promise<T> {
  const response = await fetch(buildApiUrl(path, searchParams), init)

  if (!response.ok) {
    throw new Error(await parseError(response))
  }

  return response.json() as Promise<T>
}

export async function fetchApiText(
  path: string,
  init?: RequestInit,
  searchParams?: Record<string, string | number | boolean | null | undefined>
) {
  const response = await fetch(buildApiUrl(path, searchParams), init)

  if (!response.ok) {
    throw new Error(await parseError(response))
  }

  return response.text()
}
