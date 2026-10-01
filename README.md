# Phyllo_Project

**Live interactive report → https://shreyansh0207.github.io/phyllo-meridian-audit/**

Take-home solution for the **Phyllo Product Analyst Intern** assignment: an
audit of the fictional *Meridian Orders API*, where the published docs
(`data/API_DOCS.md`) disagree with the captured API payloads (`data/*.json`).

## Open the report

Open **`site/index.html`** in any browser — an interactive writeup with the
findings, a live revenue calculator, and both Task 3 deliverables. No build
step, no server needed.

## What's inside

| Path | What it is |
|---|---|
| `WRITEUP.md` | The submission document (571 words, limit 800) |
| `site/` | Interactive dashboard — the link you'd send |
| `analysis/reconcile.py` | Stdlib-only script that re-derives every finding + number |
| `analysis/report.json` | Generated audit output |
| `deliverables/email_to_priya.md` | Task 3a — customer reply (finance-friendly) |
| `deliverables/bug_report.md` | Task 3b — engineer-ready bug report |
| `data/` | The candidate-pack inputs (docs, ticket, 3 payloads) |

## Reproduce the numbers

```bash
python analysis/reconcile.py
```

## TL;DR of the analysis

- **6 doc-vs-data disagreements found**; worst is a pagination bug where
  `has_more: false` while a next page exists → silent data loss.
- **Headline revenue: $230.70** (5 orders, refund excluded, `ord_1004`
  corrected to its component sum, `ord_1006` converted dollars → cents).
- A naive pull that trusts `has_more` sees only **$248.94** of $328.03 —
  missing $79.09 — which is the likely root of the customer's complaint
  (`data/ticket.md`).
