const DEFAULT_API_BASE_URL = "http://localhost:8000"

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE_URL

/**
 * The table the backend holds results in.
 *
 * There are two DuckDB instances in play and they do not share names. The
 * browser one holds the uploaded file under the dataset's own name; the
 * backend one receives CSV over /api/resolve, which does not send a
 * table_name, so it lands on the server default.
 *
 * Passing a browser-side name to a backend endpoint returns "table not found".
 * That is exactly how Export All broke: it sent `<dataset>_original` and got a
 * 400 while the data sat in `input_data` the whole time. Every backend query
 * about results has to use this.
 */
export const BACKEND_RESULTS_TABLE = "input_data"

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
