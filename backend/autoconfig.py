"""
Automatic matching configuration.

The gap between "powerful" and "sellable" for a record linkage tool is who has
to understand blocking rules. Splink is free, so anyone who can hand-write a
blocking strategy has no reason to pay for a wrapper around it. Anyone who
cannot write one is locked out entirely. This module closes that gap: given a
loaded table, it infers what each column means, proposes blocking rules,
*measures* how many pairs each one actually generates, and keeps the set that
fits a comparison budget.

Everything here is a heuristic and is presented to the user as a proposal they
can override -- not as a black box. Each decision carries a human-readable
reason, because a configuration nobody can inspect is one nobody can trust.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from engine import EntityResolutionEngine, quote_ident

logger = logging.getLogger(__name__)

# Comparison budget as a multiple of row count. Blocking exists to keep the
# candidate set near-linear; beyond this the run stops being interactive.
PAIR_BUDGET_MULTIPLIER = 40
MIN_PAIR_BUDGET = 20_000

# Columns emptier than this carry too little signal to match on.
MAX_EMPTY_RATIO = 0.6


class ColumnRole:
    IDENTIFIER = "identifier"
    EMAIL = "email"
    PHONE = "phone"
    PERSON_NAME = "person_name"
    COMPANY = "company"
    ADDRESS = "address"
    LOCALITY = "locality"
    POSTCODE = "postcode"
    DATE = "date"
    NUMERIC = "numeric"
    FREE_TEXT = "free_text"
    LOW_SIGNAL = "low_signal"


HEADER_PATTERNS: list[tuple[str, str]] = [
    (r"^(id|uuid|guid|.*_id|.*_key|pk|primary_key|record_no|row_?id)$", ColumnRole.IDENTIFIER),
    (r"(e[-_]?mail|email)", ColumnRole.EMAIL),
    (r"(phone|mobile|tel|telephone|contact_no|msisdn|cell)", ColumnRole.PHONE),
    (r"(first_?name|last_?name|sur_?name|full_?name|given_?name|family_?name|fname|lname|middle_?name|^name$)", ColumnRole.PERSON_NAME),
    (r"(company|organisation|organization|business|employer|vendor|supplier|account_name)", ColumnRole.COMPANY),
    (r"(address|street|addr|address_line|line1|line2)", ColumnRole.ADDRESS),
    (r"(city|town|state|province|county|country|region|locality)", ColumnRole.LOCALITY),
    (r"(post_?code|zip_?code|^zip$|pin_?code|postal)", ColumnRole.POSTCODE),
    (r"(date|_at$|_on$|created|updated|dob|birth|signup|joined)", ColumnRole.DATE),
]

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DATE_RE = re.compile(r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}|^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}")
DIGITS_RE = re.compile(r"\D")


@dataclass
class ColumnProfile:
    name: str
    role: str
    distinct: int
    rows: int
    empty_ratio: float
    reason: str = ""
    samples: list[str] = field(default_factory=list)

    @property
    def uniqueness(self) -> float:
        """Distinct values per row. ~1.0 means a key; ~0.0 means a category."""
        return self.distinct / self.rows if self.rows else 0.0

    @property
    def usable(self) -> bool:
        if self.role in (ColumnRole.IDENTIFIER, ColumnRole.LOW_SIGNAL):
            return False
        if self.empty_ratio > MAX_EMPTY_RATIO:
            return False
        return self.distinct >= 2


@dataclass
class AutoConfig:
    primary_key_column: Optional[str]
    settings: dict[str, Any]
    threshold: float
    columns: list[ColumnProfile]
    notes: list[str] = field(default_factory=list)
    estimated_pairs: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "primary_key_column": self.primary_key_column,
            "settings": self.settings,
            "threshold": self.threshold,
            "estimated_pairs": self.estimated_pairs,
            "notes": self.notes,
            "columns": [
                {
                    "name": c.name,
                    "role": c.role,
                    "distinct": c.distinct,
                    "empty_ratio": round(c.empty_ratio, 4),
                    "uniqueness": round(c.uniqueness, 4),
                    "used_for_matching": c.usable,
                    "reason": c.reason,
                }
                for c in self.columns
            ],
        }


def _classify_by_content(values: list[str], role_hint: Optional[str]) -> Optional[str]:
    """Infer a role from sampled values when the header is uninformative."""
    sample = [v for v in values if v and v.strip()]
    if not sample:
        return None

    def ratio(predicate) -> float:
        return sum(1 for v in sample if predicate(v)) / len(sample)

    if ratio(lambda v: bool(EMAIL_RE.match(v.strip()))) > 0.7:
        return ColumnRole.EMAIL
    if ratio(lambda v: bool(DATE_RE.match(v.strip()))) > 0.7:
        return ColumnRole.DATE

    # Phone: mostly digits once separators are stripped, plausible length.
    def phone_like(v: str) -> bool:
        digits = DIGITS_RE.sub("", v)
        return 7 <= len(digits) <= 15 and len(digits) / max(len(v), 1) > 0.5

    if ratio(phone_like) > 0.7:
        return ColumnRole.PHONE

    # Address: contains a house number followed by words.
    if ratio(lambda v: bool(re.match(r"^\s*\d+[\w\s.,-]{4,}$", v))) > 0.6:
        return ColumnRole.ADDRESS

    return role_hint


def profile_columns(engine: EntityResolutionEngine, table_name: str) -> list[ColumnProfile]:
    """Classify every column by header pattern, then by content."""
    profile = engine.profile_data(table_name)
    rows = profile["total_rows"]
    table = quote_ident(table_name)
    results: list[ColumnProfile] = []

    for column in profile["columns"]:
        name = column["name"]
        lowered = name.strip().lower().replace(" ", "_")

        role_hint: Optional[str] = None
        for pattern, candidate in HEADER_PATTERNS:
            if re.search(pattern, lowered):
                role_hint = candidate
                break

        try:
            samples = [
                str(row[0])
                for row in engine.con.execute(
                    f"SELECT {quote_ident(name)} FROM {table} "
                    f"WHERE {quote_ident(name)} IS NOT NULL LIMIT 200"
                ).fetchall()
            ]
        except Exception as exc:
            logger.warning("Sampling failed for %s: %s", name, exc)
            samples = []

        role = _classify_by_content(samples, role_hint) or ColumnRole.FREE_TEXT
        empty_ratio = column["null_percentage"] / 100.0
        distinct = column["distinct_count"]
        uniqueness = distinct / rows if rows else 0.0

        # A near-unique free-text column with no recognised shape is a key or a
        # note field: useless for matching either way.
        if role == ColumnRole.FREE_TEXT and uniqueness > 0.98 and rows > 50:
            role = ColumnRole.IDENTIFIER
        elif distinct <= 1:
            role = ColumnRole.LOW_SIGNAL

        item = ColumnProfile(
            name=name, role=role, distinct=distinct, rows=rows,
            empty_ratio=empty_ratio, samples=samples[:3],
        )

        # Emptiness is checked before low-signal. A column that is 95% blank
        # with one repeated value technically has one distinct value, but
        # "only one distinct value" sends the reader off to look at the values
        # when the actual problem is that almost every row is missing. The
        # explanation should name the thing they would fix.
        if role == ColumnRole.IDENTIFIER:
            item.reason = "Looks like a unique key, excluded from matching"
        elif empty_ratio > MAX_EMPTY_RATIO:
            item.reason = f"{empty_ratio:.0%} empty, too sparse to match on"
        elif role == ColumnRole.LOW_SIGNAL:
            item.reason = "Only one distinct value, so no matching signal"
        else:
            item.reason = f"Detected as {role.replace('_', ' ')}"

        results.append(item)

    return results


def choose_primary_key(columns: list[ColumnProfile]) -> Optional[str]:
    """Pick the column that best identifies a row."""
    keys = [c for c in columns if c.role == ColumnRole.IDENTIFIER and c.empty_ratio == 0]
    if not keys:
        # Fall back to any fully-populated, fully-unique column.
        keys = [c for c in columns if c.uniqueness >= 0.999 and c.empty_ratio == 0]
    if not keys:
        return None
    # Prefer the most unique, then the leftmost by original order.
    return max(keys, key=lambda c: c.uniqueness).name


def _comparison_for(column: ColumnProfile) -> Optional[dict[str, Any]]:
    """Choose a comparison appropriate to what the column holds."""
    name = column.name

    def jaro(threshold: float) -> dict[str, Any]:
        return {
            "output_column_name": name,
            "comparison_library_name": "jaro_winkler_at_thresholds",
            "threshold": threshold,
        }

    if column.role in (ColumnRole.PERSON_NAME, ColumnRole.COMPANY):
        return jaro(0.9)
    if column.role == ColumnRole.EMAIL:
        return jaro(0.9)
    if column.role == ColumnRole.PHONE:
        # Lower bar: the same number is written many different ways.
        return jaro(0.85)
    if column.role == ColumnRole.ADDRESS:
        return jaro(0.9)
    if column.role in (ColumnRole.LOCALITY, ColumnRole.POSTCODE, ColumnRole.DATE):
        return {"output_column_name": name, "comparison_library_name": "exact_match"}
    if column.role == ColumnRole.FREE_TEXT and column.uniqueness < 0.9:
        return jaro(0.9)
    return None


@dataclass
class RuleCandidate:
    """A proposed blocking rule.

    ``group_expressions`` are the same expressions as ``sql`` but written for a
    single table, so the pair count can be computed with a GROUP BY instead of
    a self-join.
    """

    sql: str
    explanation: str
    group_expressions: list[str]


def _candidate_rules(columns: list[ColumnProfile]) -> list[RuleCandidate]:
    """Blocking rules worth measuring, roughly most selective first.

    A rule is only useful if records that are genuinely the same tend to agree
    on it exactly, so high-cardinality contact fields come first, then
    combinations of moderately selective fields.
    """
    by_role: dict[str, list[ColumnProfile]] = {}
    for column in columns:
        if column.usable:
            by_role.setdefault(column.role, []).append(column)

    candidates: list[RuleCandidate] = []

    def equality(cols: list[ColumnProfile], label: str) -> RuleCandidate:
        quoted = [quote_ident(c.name) for c in cols]
        return RuleCandidate(
            sql=" AND ".join(f"l.{q} = r.{q}" for q in quoted),
            explanation=label,
            group_expressions=list(quoted),
        )

    # Single high-cardinality fields: an exact email or phone match is strong.
    for role in (ColumnRole.EMAIL, ColumnRole.PHONE, ColumnRole.ADDRESS, ColumnRole.POSTCODE):
        for column in by_role.get(role, []):
            if column.uniqueness > 0.05:
                candidates.append(equality([column], f"Same {column.name}"))

    names = by_role.get(ColumnRole.PERSON_NAME, []) + by_role.get(ColumnRole.COMPANY, [])
    localities = by_role.get(ColumnRole.LOCALITY, []) + by_role.get(ColumnRole.POSTCODE, [])

    # Two name parts together (first + last) -- selective on its own.
    if len(names) >= 2:
        candidates.append(
            equality(names[:2], f"Same {names[0].name} and {names[1].name}")
        )

    # Name plus a locality: the classic pairing for people data.
    for name_col in names:
        for locality in localities[:2]:
            candidates.append(
                equality([name_col, locality], f"Same {name_col.name} and {locality.name}")
            )

    # Last resort: initial of a name plus locality, to catch typo'd names.
    for name_col in names[:1]:
        for locality in localities[:1]:
            n, l = quote_ident(name_col.name), quote_ident(locality.name)
            candidates.append(
                RuleCandidate(
                    sql=f"substr(l.{n}, 1, 1) = substr(r.{n}, 1, 1) AND l.{l} = r.{l}",
                    explanation=f"Same first letter of {name_col.name} and same {locality.name}",
                    group_expressions=[f"substr({n}, 1, 1)", l],
                )
            )

    seen: set[str] = set()
    unique: list[RuleCandidate] = []
    for candidate in candidates:
        if candidate.sql not in seen:
            seen.add(candidate.sql)
            unique.append(candidate)
    return unique


def generate(
    engine: EntityResolutionEngine,
    table_name: str,
    threshold: float = 0.95,
    max_rules: int = 4,
) -> AutoConfig:
    """Infer a full matching configuration for a loaded table."""
    columns = profile_columns(engine, table_name)
    rows = engine.row_count(table_name)
    primary_key = choose_primary_key(columns)
    notes: list[str] = []

    if primary_key is None:
        notes.append(
            "No unique identifier column found. A row number will be used, so "
            "results cannot be traced back to your own record IDs."
        )

    comparisons = []
    for column in columns:
        if not column.usable or column.name == primary_key:
            continue
        comparison = _comparison_for(column)
        if comparison:
            comparisons.append(comparison)

    if not comparisons:
        notes.append(
            "No columns were suitable for matching. Fields are either too "
            "sparse, entirely unique, or hold a single repeated value."
        )
        return AutoConfig(primary_key, {}, threshold, columns, notes)

    # Measure candidate rules rather than trusting the cardinality estimate --
    # real data is never uniformly distributed.
    budget = max(MIN_PAIR_BUDGET, rows * PAIR_BUDGET_MULTIPLIER)
    max_single_rule = budget  # one rule may use the whole budget
    chosen: list[str] = []
    total_pairs = 0

    for candidate in _candidate_rules(columns):
        if len(chosen) >= max_rules or total_pairs >= budget:
            break
        try:
            count = engine.count_pairs_for_equality_rule(
                table_name, candidate.group_expressions
            )
        except Exception as exc:
            logger.warning("Could not measure rule %s: %s", candidate.sql, exc)
            continue

        if count == 0:
            continue
        if count > max_single_rule:
            notes.append(
                f"Skipped '{candidate.explanation}': generates {count:,} pairs, "
                f"over the {budget:,} budget for {rows:,} rows."
            )
            continue

        chosen.append(candidate.sql)
        total_pairs += count
        notes.append(
            f"Blocking on '{candidate.explanation}': {count:,} candidate pairs."
        )

    if not chosen:
        notes.append(
            "No selective blocking rule was found, so every pair of records "
            "will be compared. This is accurate but slow on large files."
        )

    settings = {
        "link_type": "dedupe_only",
        "unique_id_column_name": primary_key or "unique_id",
        "blocking_rules_to_generate_predictions": chosen,
        "comparisons": comparisons,
    }

    matched = ", ".join(c["output_column_name"] for c in comparisons)
    notes.insert(0, f"Matching on: {matched}.")

    return AutoConfig(
        primary_key_column=primary_key,
        settings=settings,
        threshold=threshold,
        columns=columns,
        notes=notes,
        estimated_pairs=total_pairs,
    )
