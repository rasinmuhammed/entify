"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { buildApiUrl } from "@/lib/api/client"
import { useWasm } from "@/lib/wasm/WasmContext"

/**
 * Loads the generated benchmark dataset without asking for a file.
 *
 * The single biggest barrier to evaluating a matching tool is having to find
 * a suitable CSV first. Most people do not have messy customer data to hand,
 * and the ones who do are not going to hand it over on a first look. This
 * fetches the generator's output from the backend and pushes it through the
 * same upload path a real file takes, so nothing about the demo is a special
 * case.
 *
 * Auto-triggers on `?demo=1` so the landing page's "use the sample dataset"
 * call to action lands somewhere that actually does something.
 */
export function SampleDatasetCard({
  onLoaded,
}: {
  onLoaded: (file: File) => Promise<void> | void
}) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  // The in-browser DuckDB runtime takes a few seconds to boot. Firing the
  // auto-load before it is ready produced an error on a page the user had
  // just arrived at, which reads as broken rather than as still starting.
  const { isReady } = useWasm()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoTriggered = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        buildApiUrl("/api/demo/dataset", { entities: 4000 })
      )
      if (!response.ok) {
        throw new Error(
          `The backend returned ${response.status}. Is it running on port 8000?`
        )
      }
      const blob = await response.blob()
      const file = new File([blob], "demo_customers.csv", { type: "text/csv" })
      await onLoaded(file)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the backend. Start it with: uvicorn api:app --port 8000"
      )
    } finally {
      setLoading(false)
    }
  }, [onLoaded])

  useEffect(() => {
    if (!isReady || params.get("demo") !== "1" || autoTriggered.current) return
    autoTriggered.current = true
    // Strip the parameter before loading. A remount -- which happens when the
    // parent refetches -- resets the ref, and a URL that still says demo=1
    // would start the upload again, and again.
    router.replace(pathname, { scroll: false })
    void load()
  }, [isReady, params, pathname, router, load])

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            No data to hand?
          </h3>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
            Load a generated customer file: about 4,700 rows covering 4,000
            real people, with nicknames, typo&apos;d emails, reformatted phone
            numbers and roughly 700 duplicates to find.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={load}
          disabled={loading || !isReady}
          className="shrink-0"
        >
          {loading || !isReady ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {loading ? "Loading" : "Starting engine"}
            </>
          ) : (
            "Load sample dataset"
          )}
        </Button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
