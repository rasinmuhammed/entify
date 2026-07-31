# LinkedIn post

Your draft, tightened. Voice kept as yours: the enthusiasm in the opening is
the best part of it and I have not sanded that off. Typos fixed (Entify not
Entity, Splink not spline), the middle tightened, and the ending finished
since yours trailed off mid-sentence.

---

I got to work on entity resolution recently, using a library called Splink,
and somewhere in the middle of reading how it actually works I fell properly in
love with the data science behind it.

Entity resolution is the problem of working out that "Barbara Reddy",
"Barbra Reddy" and "Barb Reddy", all sharing a phone number, are one customer
and not three.

It sounds simple. It is not. The proper method is a statistical model from
1969 called Fellegi-Sunter, and Splink implements it beautifully. But using it
well means understanding blocking rules, expectation maximisation and match
weights first.

That struck me as the wrong way round. The person who knows which records are
duplicates is usually not the person who can write the code. So I built a
no-code layer over Splink and called it Entify.

You give it a CSV. It works out what each column holds, proposes its own
blocking rules and comparisons, and then shows the arithmetic behind every
decision. Not "92% confident", but: these two emails are identical and that is
worth 898x the evidence, these phone numbers differ only in formatting and that
is worth 115x, these first names disagree and that argues against a match by
3x. You can see exactly why it thinks two rows are the same person.

Then I tested it against FEBRL, a published record linkage dataset used widely
in the literature, that nothing in my code was tuned for. Fully automatic, no
hand-tuning:

- Precision 1.000, recall 0.999
- Remove the near-unique identifier column, which is the honest test, because
  any matcher looks good when one column gives the answer away: precision
  1.000, recall 0.987
- Rename every column to col_1, col_2, col_3 so the headers give nothing away:
  precision 1.000, recall 0.991

Across eight adversarial variants, precision never dropped below 1.000. It
finds less when the data gets thinner. It does not start merging the wrong
people, which for a deduplication tool is the only failure that actually
destroys anything.

The benchmark also found a bug in about ninety seconds. A column of digits
comes out of the database as an integer, and the string similarity functions
only accept text, so it crashed. Every dataset I had generated myself happened
to use string IDs. My own tests could never have found it. That is the whole
argument for testing against data you did not write.

Real limits, all in the README: it is memory-bound, so compute is the main
ceiling. It exports CSV rather than writing back to your CRM. And FEBRL is a
structured benchmark that plays to this method's strengths, so unstructured
matching, product titles and the like, would likely expose genuine weakness.

Plenty left to build. Cloud execution for larger files, more connectors,
writing results back to the systems the data came from.

It runs entirely on your own machine. No accounts, no API keys, nothing leaves
your laptop.

https://github.com/rasinmuhammed/entify

---

## If you want it shorter

LinkedIn truncates after roughly three lines, so the first two sentences carry
everything. The version above is long; it will do well with a technical
audience and less well with a general one.

To cut it roughly in half, keep the opening two paragraphs, the three benchmark
bullets, the bug paragraph, and the link. Drop the explanation of
Fellegi-Sunter and the evidence example.

## Small things

- "1969" is when Fellegi and Sunter published. Worth keeping, it makes the
  point that this is a well-established method rather than something invented
  for the project.
- Do not call FEBRL a hard benchmark. It is structured person records, the
  friendly case for this method, and someone in the field will know.
- If anyone asks what makes it different from OpenRefine or pandas: those do
  exact and fuzzy matching on rules you write. This estimates the probability
  two records are the same entity from the data itself, and shows the working.
