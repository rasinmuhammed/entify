"use client"

import { useMemo, useState } from "react"
import { ChevronRight } from "lucide-react"
import evidence from "@/lib/matchEvidence.json"

/**
 * Interactive breakdown of why two records did or did not match.
 *
 * This is the product's actual differentiator made touchable. Competing tools
 * return a similarity score and ask you to trust it; Entify can show the
 * Fellegi-Sunter arithmetic: a starting prior, then each field pushing the
 * evidence up or down, summing to a match weight and a probability.
 *
 * Every number here is real output from the bundled benchmark, exported by
 * `scripts/evidence.py`. The waterfall adds up exactly: prior + every field's
 * contribution == match weight. Nothing is illustrative.
 */

type Field = {
  field: string
  left: string | null
  right: string | null
  level: string
  weight: number
}

type Pair = {
  prior: number
  leftId: string
  rightId: string
  matchWeight: number
  probability: number
  isTrueMatch: boolean
  bucket: string
  fields: Field[]
}

const PAIRS = evidence.pairs as Pair[]

const BUCKET_LABEL: Record<string, string> = {
  strong: "Confident match",
  moderate: "Harder match",
  weak: "Correctly rejected",
}

function pretty(field: string) {
  return field.replace(/_/g, " ")
}

function Value({ value }: { value: string | null }) {
  if (!value) {
    return <span className="italic text-muted-foreground/40">missing</span>
  }
  return <span className="font-mono text-[12px]">{value}</span>
}

/** One field's contribution, drawn as a bar either side of a centre line. */
function EvidenceRow({ field, max }: { field: Field; max: number }) {
  const positive = field.weight >= 0
  const magnitude = Math.min(Math.abs(field.weight) / max, 1) * 50

  return (
    <div className="grid grid-cols-[7.5rem_1fr_9rem] items-center gap-3 py-1.5 sm:grid-cols-[8rem_1fr_11rem]">
      <div className="min-w-0">
        <div className="truncate text-[13px] capitalize">{pretty(field.field)}</div>
        <div className="truncate text-[11px] text-muted-foreground/60">{field.level}</div>
      </div>

      <div className="min-w-0 space-y-0.5 text-[12px]">
        <div className="truncate">
          <Value value={field.left} />
        </div>
        <div className="truncate">
          <Value value={field.right} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative h-5 flex-1 rounded bg-muted/20">
          <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
          <div
            className={[
              "absolute inset-y-0.5 rounded-sm transition-all duration-500",
              positive ? "bg-emerald-500/70" : "bg-rose-500/70",
            ].join(" ")}
            style={
              positive
                ? { left: "50%", width: `${magnitude}%` }
                : { right: "50%", width: `${magnitude}%` }
            }
          />
        </div>
        <span
          className={[
            "w-12 shrink-0 text-right font-mono text-[11px] tabular-nums",
            positive ? "text-emerald-400" : "text-rose-400",
          ].join(" ")}
        >
          {field.weight > 0 ? "+" : ""}
          {field.weight.toFixed(2)}
        </span>
      </div>
    </div>
  )
}

export function MatchExplorer() {
  const [index, setIndex] = useState(1)
  const [threshold, setThreshold] = useState(0.95)

  const pair = PAIRS[index]
  const max = useMemo(
    () => Math.max(...pair.fields.map((f) => Math.abs(f.weight)), 1),
    [pair]
  )

  const accepted = pair.probability >= threshold
  const correct = accepted === pair.isTrueMatch

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/25">
      {/* Pair selector */}
      <div className="flex flex-wrap gap-1.5 border-b border-border/50 p-3">
        {PAIRS.map((candidate, i) => (
          <button
            key={`${candidate.leftId}-${candidate.rightId}`}
            onClick={() => setIndex(i)}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              i === index
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            ].join(" ")}
          >
            {BUCKET_LABEL[candidate.bucket] ?? candidate.bucket}
            {PAIRS.filter((p) => p.bucket === candidate.bucket).length > 1 &&
              ` ${PAIRS.slice(0, i + 1).filter((p) => p.bucket === candidate.bucket).length}`}
          </button>
        ))}
      </div>

      <div className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {pair.leftId} <ChevronRight className="inline h-3 w-3" /> {pair.rightId}
          </span>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60">
            evidence for these being the same person
          </span>
        </div>

        {/* Starting point */}
        <div className="grid grid-cols-[7.5rem_1fr_9rem] items-center gap-3 border-b border-border/40 pb-2 sm:grid-cols-[8rem_1fr_11rem]">
          <div className="text-[13px] text-muted-foreground">Starting point</div>
          <div className="text-[11px] text-muted-foreground/60">
            Two random records are unlikely to match
          </div>
          <div className="text-right font-mono text-[11px] tabular-nums text-rose-400">
            {pair.prior.toFixed(2)}
          </div>
        </div>

        <div className="divide-y divide-border/25">
          {pair.fields.map((field) => (
            <EvidenceRow key={field.field} field={field} max={max} />
          ))}
        </div>

        {/* Total */}
        <div className="mt-3 grid grid-cols-[7.5rem_1fr_9rem] items-center gap-3 border-t border-border/60 pt-3 sm:grid-cols-[8rem_1fr_11rem]">
          <div className="text-[13px] font-medium">Match weight</div>
          <div className="text-[11px] text-muted-foreground/60">
            Prior plus every field above
          </div>
          <div
            className={[
              "text-right font-mono text-sm font-medium tabular-nums",
              pair.matchWeight >= 0 ? "text-emerald-400" : "text-rose-400",
            ].join(" ")}
          >
            {pair.matchWeight > 0 ? "+" : ""}
            {pair.matchWeight.toFixed(2)}
          </div>
        </div>

        {/* Threshold interaction */}
        <div className="mt-6 rounded-xl border border-border/50 bg-background/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60">
                Match probability
              </div>
              <div className="font-mono text-2xl tabular-nums">
                {(pair.probability * 100).toFixed(2)}
                <span className="text-base text-muted-foreground">%</span>
              </div>
            </div>

            <div
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-medium",
                accepted
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-muted/40 text-muted-foreground",
              ].join(" ")}
            >
              {accepted ? "Merged" : "Left separate"}
              {" · "}
              {correct ? "correct" : "wrong call"}
            </div>
          </div>

          <label className="mt-4 block">
            <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Your threshold</span>
              <span className="font-mono tabular-nums">{threshold.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
              aria-label="Match probability threshold"
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted/40
                         accent-foreground
                         [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow"
            />
          </label>

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70">
            Drag it. A lower threshold merges more records and makes more
            mistakes. The trade-off is yours to set, not ours to hide.
          </p>
        </div>
      </div>
    </div>
  )
}
