"use client"

import { useRouter } from "next/navigation"
import { ArrowRight, Check, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DuplicateProof } from "@/components/marketing/DuplicateProof"
import { MatchExplorer } from "@/components/marketing/MatchExplorer"
import { Reveal } from "@/components/marketing/Reveal"

/**
 * Marketing page.
 *
 * The organising idea: this product's single most persuasive asset is a real
 * duplicate group. Nobody is moved by a feature grid, but everybody
 * immediately recognises "Barbara / Barbra / Barb Reddy, same phone number" as
 * a problem they have. So the page leads with measured proof and shows actual
 * records, rather than describing capabilities in the abstract.
 */

const BENCHMARK = [
  { threshold: "0.50", precision: "0.999", recall: "0.943", f1: "0.970" },
  { threshold: "0.95", precision: "0.999", recall: "0.943", f1: "0.970" },
  { threshold: "0.99", precision: "1.000", recall: "0.943", f1: "0.970" },
]

const STEPS = [
  {
    n: "01",
    title: "Upload a CSV",
    body: "Entify profiles every column, works out what it holds (names, emails, phones, addresses) and picks a primary key.",
  },
  {
    n: "02",
    title: "It configures itself",
    body: "Blocking rules and field comparisons are generated and measured against your data. Every choice comes with the reason behind it, and you can override any of them.",
  },
  {
    n: "03",
    title: "Review and export",
    body: "Inspect why any two records matched, tune the threshold, then export a deduplicated file or a PDF audit report.",
  },
]

export default function HomePage() {
  const router = useRouter()

  return (
    <div className="relative">
      {/* Hairline grid for structure rather than colour. Almost subliminal, and
          it does the job the four-hue radial wash used to do badly. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[600px] opacity-[0.35]
                   [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)]
                   [background-size:72px_72px]
                   [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]"
      />

      <section className="relative mx-auto max-w-5xl px-6 pb-24 pt-24 text-center sm:pt-32">
        <Reveal>
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-50" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Probabilistic record linkage, powered by Splink 4
          </div>

          <h1 className="mx-auto max-w-3xl text-balance text-5xl font-semibold leading-[1.04] tracking-[-0.035em] sm:text-6xl md:text-7xl">
            Your customer list has more people in it than you have customers.
          </h1>

          <p className="mx-auto mt-7 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Entify finds the records that refer to the same person or company,
            shows you exactly why each pair matched, and gives you back one
            clean row per real customer.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="h-11 px-6 text-[15px]" onClick={() => router.push("/vault")}>
              Try it on your data
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="h-11 px-6 text-[15px] text-muted-foreground hover:text-foreground"
              onClick={() => router.push("/vault?demo=1")}
            >
              Or use the sample dataset
            </Button>
          </div>

          <p className="mt-5 text-xs text-muted-foreground/70">
            Runs locally. No account required.
          </p>
        </Reveal>
      </section>

      {/* Proof, before persuasion */}
      <Reveal as="section" className="relative mx-auto max-w-5xl px-6 pb-24">
        <DuplicateProof />
      </Reveal>

      {/* The differentiator, made touchable */}
      <section className="relative mx-auto max-w-5xl px-6 pb-28">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight">
            See why it decided
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
            Most matching tools hand you a similarity score and ask you to
            trust it. Entify shows the arithmetic: a starting assumption that
            two random records are unrelated, then every field pushing the
            evidence up or down until it lands on a probability.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground/70">
            Real pairs from the benchmark below, including one the model
            correctly refused to merge.
          </p>
        </Reveal>

        <Reveal delay={80} className="mt-8">
          <MatchExplorer />
        </Reveal>
      </section>

      {/* Measured results */}
      <section className="relative border-y border-border/50 bg-card/20">
        <Reveal className="mx-auto max-w-5xl px-6 py-20">
          <div className="grid gap-12 md:grid-cols-[1fr_1.1fr] md:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">
                Accuracy you can check
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Most matching tools ask you to trust them. Entify ships the
                benchmark: a generated dataset where every duplicate is known in
                advance, so precision and recall are measured rather than
                claimed.
              </p>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                Run it yourself. It is part of the test suite, and a regression
                fails the build.
              </p>

              <div className="mt-6 flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5 font-mono text-[13px] text-muted-foreground">
                <Terminal className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="truncate">pytest tests/test_matching_quality.py</span>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border/60 bg-background/40">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Threshold</th>
                    <th className="px-5 py-3 font-medium">Precision</th>
                    <th className="px-5 py-3 font-medium">Recall</th>
                    <th className="px-5 py-3 font-medium">F1</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {BENCHMARK.map((row) => (
                    <tr key={row.threshold} className="border-b border-border/40 last:border-0">
                      <td className="px-5 py-3 text-muted-foreground">{row.threshold}</td>
                      <td className="px-5 py-3">{row.precision}</td>
                      <td className="px-5 py-3">{row.recall}</td>
                      <td className="px-5 py-3 text-emerald-400">{row.f1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-border/60 px-5 py-3 text-xs leading-relaxed text-muted-foreground/80">
                3,671 records · 3,000 distinct entities · 18% duplicate rate ·
                ~1.5s end to end
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <Reveal as="h2" className="text-3xl font-semibold tracking-tight">
          You don&apos;t need to know what a blocking rule is
        </Reveal>
        <Reveal as="p" className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
          Record linkage normally demands that you hand-write blocking
          strategies and comparison levels. Entify works them out from your
          data, and on our benchmark its automatic configuration scores
          higher than the one we tuned by hand.
        </Reveal>

        <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 md:grid-cols-3">
          {STEPS.map((step) => (
            <Reveal key={step.n} className="bg-background p-7">
              <div className="font-mono text-xs text-muted-foreground/60">{step.n}</div>
              <h3 className="mt-4 text-lg font-medium tracking-tight">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Honesty section: differentiating, and it is true */}
      <section className="border-t border-border/50 bg-card/20">
        <Reveal className="mx-auto max-w-5xl px-6 py-20">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                What it does well
              </h2>
              <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {[
                  "Probabilistic matching that survives typos, nicknames and reformatted phone numbers",
                  "An explanation for every match, showing which field contributed how much evidence",
                  "One clean row per entity, with a trail back to the records it came from",
                  "A PDF audit report where every figure is measured, not estimated",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                What it doesn&apos;t, yet
              </h2>
              <ul className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
                {[
                  "Very large files on small machines. Matching is memory-bound, so the ceiling tracks available RAM",
                  "Concurrent runs; one result is held at a time",
                  "Writing back to your CRM, since export is CSV",
                  "Incremental matching as new records arrive",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs leading-relaxed text-muted-foreground/70">
                Listed because you would find out anyway, and the second list is
                shorter than it looks.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-28 text-center">
        <Reveal>
          <h2 className="text-balance text-4xl font-semibold tracking-tight">
            Find out how many duplicates you have.
          </h2>
          <p className="mx-auto mt-4 max-w-md leading-relaxed text-muted-foreground">
            Upload a file and get the number in about a minute. Nothing leaves
            your machine.
          </p>
          <Button size="lg" className="mt-9 h-11 px-7 text-[15px]" onClick={() => router.push("/vault")}>
            Get started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Reveal>
      </section>
    </div>
  )
}
