"use client"

import { useState } from "react"
import { Loader2, Wand2, Check, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { autoConfigure, type AutoConfigResult } from "@/lib/api/splinkClient"

/**
 * One button that configures the whole match.
 *
 * The engine could always infer blocking rules, comparisons and a primary key
 * from a file, but only through the API. Inside the workspace you still had to
 * write rules by hand, which is precisely the barrier auto-configuration
 * exists to remove. This closes that gap.
 *
 * It shows what it decided before anything is applied. Silently filling the
 * form would be faster and worse: the reason someone trusts a configuration
 * they did not write is that they can see why each choice was made, and which
 * columns were rejected.
 */
export function AutoConfigureCard({
  getCsv,
  onApply,
  disabled,
}: {
  getCsv: () => Promise<string>
  onApply: (config: AutoConfigResult) => void
  disabled?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AutoConfigResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setError(null)
    try {
      setResult(await autoConfigure(await getCsv()))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-configuration failed")
    } finally {
      setLoading(false)
    }
  }

  const used = result?.columns.filter((c) => c.used_for_matching) ?? []
  const skipped = result?.columns.filter((c) => !c.used_for_matching) ?? []

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Wand2 className="h-4 w-4 text-muted-foreground" />
            Configure this for me
          </h3>
          <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Reads your data, works out what each column holds, and proposes
            blocking rules and comparisons. You see every decision before
            anything is applied.
          </p>
        </div>

        <Button onClick={run} disabled={loading || disabled} className="shrink-0">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analysing
            </>
          ) : (
            "Configure automatically"
          )}
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      {result && (
        <div className="mt-5 space-y-4 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Primary key" value={result.primary_key_column ?? "row number"} />
            <Stat label="Matching on" value={`${used.length} columns`} />
            <Stat
              label="Candidate pairs"
              value={result.estimated_pairs.toLocaleString()}
            />
          </div>

          {result.settings.blocking_rules_to_generate_predictions.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Blocking rules
              </p>
              <div className="space-y-1">
                {result.settings.blocking_rules_to_generate_predictions.map((rule) => (
                  <code
                    key={rule}
                    className="block overflow-x-auto rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {rule}
                  </code>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Column decisions
            </p>
            <div className="space-y-1">
              {used.map((column) => (
                <Decision key={column.name} column={column} included />
              ))}
              {skipped.map((column) => (
                <Decision key={column.name} column={column} />
              ))}
            </div>
          </div>

          {result.notes.length > 0 && (
            <ul className="space-y-1">
              {result.notes.map((note) => (
                <li key={note} className="text-[11px] leading-relaxed text-muted-foreground">
                  {note}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => {
                onApply(result)
                setResult(null)
              }}
            >
              Apply this configuration
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium">{value}</p>
    </div>
  )
}

function Decision({
  column,
  included = false,
}: {
  column: { name: string; reason: string }
  included?: boolean
}) {
  return (
    <div className="flex items-start gap-2 text-[11px]">
      {included ? (
        <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
      ) : (
        <X className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50" />
      )}
      <span className="font-mono text-foreground/80">{column.name}</span>
      <span className="text-muted-foreground">{column.reason}</span>
    </div>
  )
}
