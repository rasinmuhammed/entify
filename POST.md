# LinkedIn draft

Pick one opening, delete the rest. The first is the strongest for a technical
audience because it leads with a failure rather than a feature.

---

## Option A: lead with the bug

I spent a while building an entity resolution tool, then tested it against a
benchmark I did not write. It found a bug in about ninety seconds.

Entity resolution is the problem of working out that "Barbara Reddy",
"Barbra Reddy" and "Barb Reddy" with the same phone number are one customer,
not three. Most tools hand you a similarity score and ask you to trust it.

I built Entify to show its working instead. It reads a CSV, works out what
each column holds, proposes its own blocking rules and comparisons, and then
shows the arithmetic behind every decision: a starting assumption that two
random records are unrelated, then each field pushing the evidence up or down
until it lands on a probability.

Then I ran it against FEBRL, a published record linkage dataset used widely in
the literature. Nothing was tuned for it. It crashed immediately, because a
column of digits arrives from the database as an integer and the string
similarity functions only accept text. Every dataset I had generated myself
happened to use string IDs, so my own tests could never have found it.

After the fix, configuring itself with no hand-tuning:

- Precision 1.000, recall 0.999
- Remove the near-unique identifier column, which is the honest test: precision
  1.000, recall 0.987
- Rename every column to col_1, col_2, col_3 so the headers give nothing away:
  precision 1.000, recall 0.991

Across eight adversarial variants, precision never dropped below 1.000. It
finds less when the data gets thinner. It does not start merging the wrong
people, which for a deduplication tool is the only failure that actually
destroys anything.

It also has real limits, which are in the README: it is memory-bound, it
exports CSV rather than writing back to your CRM, and FEBRL is a structured
benchmark that plays to this method's strengths. Unstructured product matching
would likely expose genuine weakness.

Runs locally. No accounts, no API keys, nothing leaves your machine.

https://github.com/rasinmuhammed/entify

---

## Option B: shorter, leads with the product

Most deduplication tools give you a confidence score and ask you to trust it.
I wanted one that shows its working.

Entify reads a messy CSV, works out what each column holds, configures its own
matching rules, and then explains every decision. Not "92% match", but: the
emails agree and that is worth 898x the evidence, the phone numbers differ only
in formatting and that is worth 115x, the first names disagree and that argues
against by 3x.

I tested the automatic configuration against FEBRL, a published benchmark
nothing here was tuned for. With no hand-tuning at all: precision 1.000,
recall 0.987 once you remove the near-unique identifier that makes any matcher
look good.

Then I tried to break it. Renamed every column to col_1, col_2, col_3 so the
headers gave nothing away. Added junk columns. Blanked 35% of the names and
dates. Precision stayed at 1.000 through all of it. It finds less as the data
degrades; it does not start merging unrelated people.

Built on Splink 4, the UK Ministry of Justice's record linkage library, and
DuckDB. Runs on your own machine, so customer data never leaves it.

Open source, with the benchmarks and the limitations both written down.

https://github.com/rasinmuhammed/entify

---

## Notes before posting

- Clean clone verified: fresh clone from GitHub into an empty virtualenv,
  install, 81 tests passing, server boots, demo endpoint answers. It found one
  test that only passed where an optional dependency happened to be installed,
  which is exactly what a new user would have hit.
- Clerk instance deleted, so the committed key is dead. The Supabase anon key
  is still in history; it is designed to be public, but rotate it if the
  project is still live.
- Do not describe FEBRL as a hard benchmark. It is structured person records,
  which is the friendly case for probabilistic linkage. Someone who works in
  this field will know, and the claim inverts if you overstate it.
- The strongest thing here is not the score. It is that the numbers are
  reproducible, the caveats are stated, and the benchmark found a bug you then
  wrote about.
