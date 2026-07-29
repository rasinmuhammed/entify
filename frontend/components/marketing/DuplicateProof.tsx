"use client"

import { ArrowDown, Sparkles } from "lucide-react"

/**
 * The single most persuasive thing this product can show: four records that
 * are obviously the same person, and the one clean record they collapse into.
 *
 * The data is real output from the bundled benchmark, not invented for the
 * page. The same group appears on page 2 of the generated audit report. The
 * fields that differ are highlighted, because the argument is not "we found a
 * match", it is "look how little these rows have in common on the surface".
 */

type Record = {
  id: string
  first: string
  last: string
  email: string
  phone: string
  /** Fields that differ from the surviving record, highlighted in the table. */
  diff: Array<"first" | "last" | "email" | "phone">
}

const CLUSTER: Record[] = [
  {
    id: "CUST-000914",
    first: "Barbara", last: "Reddy",
    email: "barbara.reddy481@outlook.com", phone: "+80 115 652 8741",
    diff: [],
  },
  {
    id: "CUST-000915",
    first: "Barbra", last: "Reddy",
    email: "barbara.eeddy481@outlook.com", phone: "+80 115 652 8741",
    diff: ["first", "email"],
  },
  {
    id: "CUST-000916",
    first: "Barb", last: "Reddy",
    email: "barbara.reddy481@outlook.com", phone: "8011565287 41",
    diff: ["first", "phone"],
  },
  {
    id: "CUST-000917",
    first: "Barbara", last: "Reddy",
    email: "", phone: "(801) 156-528741",
    diff: ["email", "phone"],
  },
]

const SURVIVOR = {
  first: "Barbara",
  last: "Reddy",
  email: "barbara.reddy481@outlook.com",
  phone: "+80 115 652 8741",
}

function Cell({
  value,
  changed,
  mono,
}: {
  value: string
  changed?: boolean
  mono?: boolean
}) {
  return (
    <td
      className={[
        "px-4 py-2.5 align-middle whitespace-nowrap",
        mono ? "font-mono text-[12px]" : "text-[13px]",
        changed ? "text-amber-300/90" : "text-foreground/80",
      ].join(" ")}
    >
      {value || <span className="text-muted-foreground/40">&middot;</span>}
    </td>
  )
}

export function DuplicateProof() {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium tracking-tight text-muted-foreground">
          Four rows in a customer file
        </h2>
        <span className="font-mono text-xs text-muted-foreground/60">
          match probability 0.99
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/30">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground/70">
              <th className="px-4 py-2.5 font-medium">Record</th>
              <th className="px-4 py-2.5 font-medium">First</th>
              <th className="px-4 py-2.5 font-medium">Last</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Phone</th>
            </tr>
          </thead>
          <tbody>
            {CLUSTER.map((row) => (
              <tr key={row.id} className="border-b border-border/30 last:border-0">
                <Cell value={row.id} mono />
                <Cell value={row.first} changed={row.diff.includes("first")} />
                <Cell value={row.last} changed={row.diff.includes("last")} />
                <Cell value={row.email} changed={row.diff.includes("email")} mono />
                <Cell value={row.phone} changed={row.diff.includes("phone")} mono />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground/70">
        <ArrowDown className="h-3.5 w-3.5" />
        <span>merged, field by field</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04]">
        <table className="w-full min-w-[640px] border-collapse">
          <tbody>
            <tr>
              <td className="w-[1%] px-4 py-3.5 align-middle whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 font-mono text-[11px] text-emerald-300">
                  <Sparkles className="h-3 w-3" />
                  1 record
                </span>
              </td>
              <Cell value={SURVIVOR.first} />
              <Cell value={SURVIVOR.last} />
              <Cell value={SURVIVOR.email} mono />
              <Cell value={SURVIVOR.phone} mono />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="pt-1 text-xs leading-relaxed text-muted-foreground/70">
        Survivorship runs per field, not per row. The most complete email and
        the best-formatted phone number often live on different records. The
        source IDs are kept, so any merge can be traced or undone.
      </p>
    </div>
  )
}
