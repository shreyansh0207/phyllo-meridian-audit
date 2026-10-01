# Meridian Orders API — Product Analyst Take-Home
**Shreyansh Shukla · Phyllo (Product Analyst Intern application)**

Everything below is reproducible: `python analysis/reconcile.py` re-derives every
number and finding from the three captured payloads in `data/`.

## Task 1 — What doesn't match

I checked every promise in `API_DOCS.md` against the three responses. Six disagree.

**1. Pagination stops early — the worst one.** The docs say to use `has_more`
to decide whether to fetch another page. `orders_page1.json` returns
`has_more: false` — yet it also returns `next_cursor: cur_8f2a19bd`, and the
capture made with that cursor (`orders_page2.json`) contains two more real
orders. Any client that follows the documented behaviour stops after page one
and silently drops `ord_1005` and `ord_1006`.

**2. `total` is not always its own parts.** The docs promise `total` *"always
equals subtotal + tax + shipping."* For `ord_1004`: 6200 + 511 + 599 = 7310
($73.10), but `total` is 6810 ($68.10) — a $5.00 gap.

**3. Money is not always integer cents.** The docs say all monetary amounts
are integers in the smallest unit. `ord_1006` returns floats in dollars
(`total: 53.62`). A client that sums these as cents books $0.54 instead of
$53.62; any mixed-unit sum is meaningless.

**4. An undocumented status.** `ord_1003` is `refunded`, outside the
documented enum (`pending, shipped, delivered, cancelled`). Strict validators
break, and the docs give no rule for whether refunded money counts as revenue.

**5. Missing orders return 200, not 404.** The docs promise a 404;
`order_ord_9999.json` shows a `200` with body `{"order": null}`, in a
different envelope from the list endpoint's order object.

**6. `customer.email` is not "always present."** `ord_1005` has
`email: null` (guest checkout), which the docs deny is possible.

**Why #1 is the worst:** it fails silently — no error, no log; the data just
stops. Every paginating client undercounts, and the undercount lands exactly
where it hurts most: revenue reporting. It also poisons the rest of the data:
once page one lies about `has_more`, page two's `has_more: false` cannot be
trusted either, so I cannot rule out a page three.

## Task 2 — Total revenue

One number cannot be defended without two definitions Meridian never gave —
what counts as revenue, and which figure is authoritative for `ord_1004`.
What I *can* defend is the range and the reasoning:

| Scenario | Orders | Rule | Total |
|---|---|---|---|
| A | 6 | sum stored `total` as-is | $328.03 |
| B | 5 | A, excluding refunded `ord_1003` | $225.70 |
| **C** | **5** | **B, with `ord_1004` corrected to its component sum** | **$230.70** |
| D | 6 | A, with `ord_1004` corrected | $333.03 |

**My answer: $230.70** — five orders (refund excluded), `ord_1006` converted
from float dollars to cents, `ord_1004` taken at the sum of its components.
The deliverable is really the three choices behind it: refund treatment, unit
normalisation, and trusting components over a stored total that contradicts
them.

**What I cannot tell from this data** (and what I would ask Meridian):
whether pages beyond two exist; whether the dashboard counts refunds; and
which `ord_1004` figure its ledger holds.

## Task 3 — The two writes

Both are in `deliverables/`: a short reply to Priya — her pull is most likely
missing page two ($79.09), with a further $5.00 ambiguity on `ord_1004` and a
$102.33 refund-treatment question — and an engineer-ready bug report for the
pagination defect with reproduction steps, expected vs. actual, and a
suggested contract test.
