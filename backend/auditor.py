"""
Data quality audit report.

This is the artefact a customer actually reads, so the rules here are strict:

**Every number in it is measured, never modelled.** The previous version of
this file printed an "Estimated Waste / Savings" figure that was passed in by
the caller and hardcoded to 140000 in its own example. A fabricated number in
front of a client is indefensible the moment they ask how it was calculated.

What replaces it: measured counts, the methodology that produced them, real
example duplicates as evidence, and a cost worksheet where the *customer*
supplies their own unit costs. Their arithmetic on their own inputs persuades
better than an invented total, and it survives scrutiny.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional, Sequence

from fpdf import FPDF

INK = (17, 24, 39)
MUTED = (107, 114, 128)
ACCENT = (37, 99, 235)
WARN = (180, 83, 9)
RULE = (229, 231, 235)


@dataclass
class CostAssumption:
    """One line of the cost worksheet, supplied by the customer.

    ``unit_cost`` is None when they have not given a figure yet: the line still
    prints, with a blank for them to fill in, so the worksheet doubles as the
    question we are asking them.
    """

    label: str
    unit_cost: Optional[float] = None
    unit: str = "per duplicate record"
    note: str = ""


@dataclass
class AuditInput:
    """Everything the report needs. All of it comes from a real matching run."""

    total_records: int
    duplicate_records: int
    duplicate_clusters: int
    distinct_entities: int
    largest_cluster_size: int
    threshold: float
    columns: Sequence[dict[str, Any]] = field(default_factory=list)
    example_clusters: Sequence[Sequence[dict[str, Any]]] = field(default_factory=list)
    dataset_name: str = "Customer dataset"
    prepared_for: str = ""
    currency: str = "$"
    cost_assumptions: Sequence[CostAssumption] = field(default_factory=list)
    benchmark: Optional[dict[str, float]] = None
    training: Optional[dict[str, Any]] = None

    @property
    def duplicate_rate(self) -> float:
        return (self.duplicate_records / self.total_records * 100) if self.total_records else 0.0


class AuditPDF(FPDF):
    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 8, "Data Quality Audit", align="L")
        self.cell(0, 8, self.title, align="R", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*RULE)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 10, f"Page {self.page_no()} of {{nb}}", align="C")


class Auditor:
    """Renders an :class:`AuditInput` to PDF."""

    def generate_report(self, audit: AuditInput, output_path: str = "audit_report.pdf") -> str:
        pdf = AuditPDF()
        pdf.set_title(audit.dataset_name)
        pdf.set_auto_page_break(auto=True, margin=18)
        pdf.add_page()

        # Order matters: the headline and the completeness table share page 1
        # so the first thing a reader sees is dense with findings, not padding.
        self._cover(pdf, audit)
        self._headline(pdf, audit)
        self._completeness(pdf, audit)
        self._evidence(pdf, audit)
        self._worksheet(pdf, audit)
        self._methodology(pdf, audit)

        pdf.output(output_path)
        return output_path

    # -- sections ----------------------------------------------------------

    def _cover(self, pdf: AuditPDF, audit: AuditInput) -> None:
        pdf.set_font("Helvetica", "B", 26)
        pdf.set_text_color(*INK)
        pdf.cell(0, 14, "Data Quality Audit", new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("Helvetica", "", 12)
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 7, audit.dataset_name, new_x="LMARGIN", new_y="NEXT")
        if audit.prepared_for:
            pdf.cell(0, 7, f"Prepared for {audit.prepared_for}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 7, date.today().strftime("%d %B %Y"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(6)

    def _headline(self, pdf: AuditPDF, audit: AuditInput) -> None:
        self._heading(pdf, "What we found")

        pdf.set_font("Helvetica", "B", 40)
        pdf.set_text_color(*ACCENT)
        pdf.cell(0, 18, f"{audit.duplicate_records:,}", new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("Helvetica", "", 12)
        pdf.set_text_color(*INK)
        pdf.multi_cell(
            0, 6,
            f"duplicate records in {audit.total_records:,} rows "
            f"({audit.duplicate_rate:.1f}% of the file).",
            new_x="LMARGIN", new_y="NEXT",
        )
        pdf.ln(4)

        self._table(
            pdf,
            [
                ("Total records in file", f"{audit.total_records:,}"),
                ("Distinct real entities", f"{audit.distinct_entities:,}"),
                ("Records that could be removed", f"{audit.duplicate_records:,}"),
                ("Groups containing duplicates", f"{audit.duplicate_clusters:,}"),
                ("Largest single group", f"{audit.largest_cluster_size:,} records"),
            ],
        )
        pdf.ln(2)
        self._note(
            pdf,
            "\"Records that could be removed\" counts every row beyond the first in each "
            "duplicate group. Collapsing each group to one surviving record removes exactly "
            "this many rows.",
        )

    def _evidence(self, pdf: AuditPDF, audit: AuditInput) -> None:
        if not audit.example_clusters:
            return

        pdf.add_page()
        self._heading(pdf, "Examples from your data")
        self._note(
            pdf,
            "Real groups the matcher identified, shown verbatim. These are the strongest "
            "check on the numbers above: if these are not duplicates, the count is wrong.",
        )
        pdf.ln(2)

        for index, cluster in enumerate(audit.example_clusters[:6], start=1):
            if not cluster:
                continue
            fields = [k for k in cluster[0] if k not in {"cluster_id", "cluster_size"}][:5]

            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(*INK)
            pdf.cell(0, 7, f"Group {index} - {len(cluster)} records", new_x="LMARGIN", new_y="NEXT")

            width = (pdf.w - pdf.l_margin - pdf.r_margin) / max(len(fields), 1)

            pdf.set_font("Helvetica", "B", 7)
            pdf.set_text_color(*MUTED)
            for name in fields:
                pdf.cell(width, 5, self._fit(pdf, name, width), border="B")
            pdf.ln()

            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(*INK)
            for row in cluster[:4]:
                for name in fields:
                    pdf.cell(width, 5, self._fit(pdf, row.get(name), width))
                pdf.ln()
            pdf.ln(4)

    def _completeness(self, pdf: AuditPDF, audit: AuditInput) -> None:
        if not audit.columns:
            return

        pdf.ln(6)
        self._heading(pdf, "Field completeness")
        self._note(
            pdf,
            "Empty counts include both nulls and blank strings. Sparse fields are usually "
            "why duplicates were not caught earlier -- a matcher cannot use a field that is "
            "mostly missing.",
        )
        pdf.ln(3)

        usable = pdf.w - pdf.l_margin - pdf.r_margin
        widths = [usable * 0.34, usable * 0.22, usable * 0.22, usable * 0.22]

        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*MUTED)
        for header, width in zip(["Field", "Empty", "% empty", "Distinct"], widths):
            pdf.cell(width, 7, header, border="B")
        pdf.ln()

        pdf.set_font("Helvetica", "", 9)
        for column in audit.columns:
            empty_pct = float(column.get("null_percentage", 0.0))
            pdf.set_text_color(*(WARN if empty_pct >= 20 else INK))
            values = [
                str(column.get("name", column.get("column", ""))),
                f"{int(column.get('empty_count', column.get('null_count', 0))):,}",
                f"{empty_pct:.1f}%",
                f"{int(column.get('distinct_count', column.get('unique_count', 0))):,}",
            ]
            for value, width in zip(values, widths):
                pdf.cell(width, 6, self._fit(pdf, value, width))
            pdf.ln()

    def _worksheet(self, pdf: AuditPDF, audit: AuditInput) -> None:
        pdf.add_page()
        self._heading(pdf, "What this costs you")

        self._note(
            pdf,
            "We deliberately do not estimate your savings -- we do not know your unit costs, "
            "and a number we invented would not survive your finance team. Fill in the rates "
            "you actually pay and the arithmetic is yours.",
        )
        pdf.ln(4)

        assumptions = list(audit.cost_assumptions) or [
            CostAssumption("Wasted marketing sends", unit="per duplicate per send"),
            CostAssumption("Duplicate physical mail", unit="per duplicate per mailing"),
            CostAssumption("Support time reconciling records", unit="per duplicate per year"),
        ]

        usable = pdf.w - pdf.l_margin - pdf.r_margin
        widths = [usable * 0.40, usable * 0.24, usable * 0.16, usable * 0.20]

        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*MUTED)
        for header, width in zip(["Cost driver", "Your rate", "Duplicates", "Total"], widths):
            pdf.cell(width, 7, header, border="B")
        pdf.ln()

        pdf.set_font("Helvetica", "", 9)
        for assumption in assumptions:
            if assumption.unit_cost is None:
                rate, total = "__________", "__________"
                pdf.set_text_color(*MUTED)
            else:
                rate = f"{audit.currency}{assumption.unit_cost:,.2f}"
                total = f"{audit.currency}{assumption.unit_cost * audit.duplicate_records:,.2f}"
                pdf.set_text_color(*INK)
            for value, width in zip(
                [assumption.label[:44], rate, f"{audit.duplicate_records:,}", total], widths
            ):
                pdf.cell(width, 7, value)
            pdf.ln()
            if assumption.note:
                pdf.set_font("Helvetica", "I", 7)
                pdf.set_text_color(*MUTED)
                pdf.cell(0, 4, f"   {assumption.note}", new_x="LMARGIN", new_y="NEXT")
                pdf.set_font("Helvetica", "", 9)

        priced = [a for a in assumptions if a.unit_cost is not None]
        if priced:
            total = sum(a.unit_cost for a in priced) * audit.duplicate_records
            pdf.ln(2)
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(*INK)
            pdf.cell(sum(widths[:3]), 8, "Total, on the rates you supplied", border="T")
            pdf.cell(widths[3], 8, f"{audit.currency}{total:,.2f}", border="T")
            pdf.ln(10)

    def _methodology(self, pdf: AuditPDF, audit: AuditInput) -> None:
        self._heading(pdf, "How these numbers were produced")

        rows = [
            ("Method", "Probabilistic record linkage (Fellegi-Sunter) via Splink 4"),
            ("Match threshold", f"{audit.threshold:.2f} match probability"),
            ("Grouping", "Transitive closure over pairs above the threshold"),
        ]
        if audit.training:
            trained = "yes" if audit.training.get("fully_trained") else "partial"
            rows.append(("Model trained on your data", trained))
        if audit.benchmark:
            rows.append(
                (
                    "Benchmark accuracy",
                    f"precision {audit.benchmark.get('precision', 0):.1%}, "
                    f"recall {audit.benchmark.get('recall', 0):.1%}",
                )
            )
        self._table(pdf, rows, label_ratio=0.34)

        pdf.ln(3)
        self._note(
            pdf,
            "Threshold choice is a trade-off, not a fact: a lower threshold finds more "
            "duplicates and makes more mistakes. This report uses a deliberately "
            "conservative setting, so the duplicate count is more likely to understate "
            "than overstate the problem.",
        )
        if audit.benchmark:
            pdf.ln(1)
            self._note(
                pdf,
                "Benchmark figures come from a labelled dataset with known duplicates, not "
                "from your file. They describe the method's accuracy, not a guarantee about "
                "these specific results.",
            )

    # -- primitives --------------------------------------------------------

    @staticmethod
    def _fit(pdf: AuditPDF, text: str, width: float) -> str:
        """Truncate to the actual rendered width, with an ellipsis.

        Character-count truncation cuts proportional fonts at the wrong place
        and mangles values like email addresses.
        """
        text = "" if text is None else str(text)
        budget = width - 1.5
        if pdf.get_string_width(text) <= budget:
            return text
        ellipsis = pdf.get_string_width("...")
        while text and pdf.get_string_width(text) + ellipsis > budget:
            text = text[:-1]
        return text + "..." if text else ""

    def _heading(self, pdf: AuditPDF, text: str) -> None:
        pdf.set_font("Helvetica", "B", 15)
        pdf.set_text_color(*INK)
        pdf.cell(0, 10, text, new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(*RULE)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
        pdf.ln(4)

    def _note(self, pdf: AuditPDF, text: str) -> None:
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*MUTED)
        pdf.multi_cell(0, 5, text, new_x="LMARGIN", new_y="NEXT")

    def _table(self, pdf: AuditPDF, rows: Sequence[tuple[str, str]], label_ratio: float = 0.62) -> None:
        usable = pdf.w - pdf.l_margin - pdf.r_margin
        label_width = usable * label_ratio
        pdf.set_font("Helvetica", "", 10)
        for label, value in rows:
            pdf.set_text_color(*MUTED)
            pdf.cell(label_width, 7, label, border="B")
            pdf.set_text_color(*INK)
            pdf.set_font("Helvetica", "B", 10)
            pdf.cell(usable - label_width, 7, value, border="B")
            pdf.set_font("Helvetica", "", 10)
            pdf.ln()


def build_audit_input(
    profile: dict[str, Any],
    summary: dict[str, Any],
    example_clusters: Sequence[Sequence[dict]] = (),
    **kwargs,
) -> AuditInput:
    """Assemble an :class:`AuditInput` from engine output.

    Keeps the mapping between engine payloads and the report in one place, so a
    key rename cannot silently blank a figure in a customer-facing document.
    """
    total = int(summary.get("total_records") or profile.get("total_rows") or 0)
    duplicates = int(summary.get("duplicate_records", 0))
    return AuditInput(
        total_records=total,
        duplicate_records=duplicates,
        duplicate_clusters=int(summary.get("duplicate_clusters", 0)),
        distinct_entities=int(summary.get("total_clusters") or max(total - duplicates, 0)),
        largest_cluster_size=int(summary.get("largest_cluster_size", 0)),
        threshold=float(summary.get("threshold", 0.95)),
        columns=profile.get("columns", []),
        example_clusters=list(example_clusters),
        **kwargs,
    )
