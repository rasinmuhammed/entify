/**
 * Identifier and literal quoting for the in-browser DuckDB queries.
 *
 * Table and column names here come from uploaded files, so they routinely
 * contain spaces (`Customer ID`), punctuation, and occasionally quotes. Several
 * queries interpolated them raw, which is a syntax error on any such name: a
 * spreadsheet exported with `First Name` as a header broke the query rather
 * than matching on it.
 *
 * DuckDB-WASM runs client-side against the user's own data, so this is a
 * correctness problem rather than a remote attack surface. The backend already
 * enforces the same discipline through `quote_ident`.
 */

/** Quote an identifier, doubling any embedded quote per the SQL standard. */
export function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`
}

/** Quote a string literal, doubling any embedded apostrophe. */
export function quoteLiteral(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL"
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * Build a parenthesised value list for an `IN (...)` clause.
 *
 * Returns a list that matches nothing when empty, because `IN ()` is a syntax
 * error in DuckDB and callers were producing it whenever a selection was
 * cleared.
 */
export function inList(values: Array<string | number>): string {
  if (values.length === 0) return "(NULL)"
  return `(${values.map(quoteLiteral).join(", ")})`
}
