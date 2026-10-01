#!/usr/bin/env python3
"""Meridian Orders API - documentation vs. data audit + revenue reconciliation.

Reads the three captured API payloads in ../data and checks each promise made
in API_DOCS.md against what the data actually does. Writes report.json with
findings and revenue scenarios.

Stdlib only. Run:  python reconcile.py
"""

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = pathlib.Path(__file__).resolve().parent / "report.json"

DOC_STATUSES = {"pending", "shipped", "delivered", "cancelled"}


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def cents(value, currency="USD"):
    """Format an integer-cents amount as a currency string."""
    return f"{currency} {value / 100:,.2f}"


def main():
    page1 = load("orders_page1.json")
    page2 = load("orders_page2.json")
    missing = load("order_ord_9999.json")

    orders = page1["data"] + page2["data"]
    findings = []

    # ---- F1: pagination terminator -------------------------------------
    # Docs: "Check has_more to decide whether to request another page."
    # Page 1 says has_more=false while next_cursor is set AND page 2 exists.
    f1_hurts = (
        "A client following the docs stops after page 1 and silently loses "
        f"every order after cursor {page1['next_cursor']!r} "
        f"({len(page2['data'])} orders, "
        f"{cents(sum(o['total'] for o in page2['data'] if isinstance(o['total'], int)))} "
        "of stated totals). No error is raised, so the undercount is invisible."
    )
    findings.append({
        "id": "F1",
        "severity": "critical",
        "title": "Pagination stops early: has_more=false while more orders exist",
        "docs_say": "Check has_more to decide whether to request another page; "
                    "when true, pass next_cursor as starting_after.",
        "data_does": f"orders_page1.json has has_more=false but next_cursor="
                     f"{page1['next_cursor']!r}; the capture for that cursor "
                     f"(orders_page2.json) contains {len(page2['data'])} more orders.",
        "hurts": f1_hurts,
    })

    # ---- F2: total invariant -------------------------------------------
    f2_details = []
    for o in orders:
        parts = o["subtotal"] + o["tax"] + o["shipping"]
        if isinstance(parts, float) or parts != o["total"]:
            f2_details.append(
                f"{o['id']}: subtotal+tax+shipping = {cents(int(round(parts)))} "
                f"but total = {o['total']} ({cents(o['total']) if isinstance(o['total'], int) else o['total']})"
            )
    findings.append({
        "id": "F2",
        "severity": "high",
        "title": "total does not always equal subtotal + tax + shipping",
        "docs_say": "total: Amount charged. Always equals subtotal + tax + shipping.",
        "data_does": "; ".join(f2_details) + ".",
        "hurts": "Anyone recomputing the total from its components gets a "
                 "different number than the stored total. Summing totals vs. "
                 "summing components disagree by "
                 f"{cents(sum(int(round(o['subtotal']+o['tax']+o['shipping'])) - (o['total'] if isinstance(o['total'], int) else int(round(o['total']*100))) for o in orders if (o['subtotal']+o['tax']+o['shipping']) != o['total']))} "
                 "here - exactly the kind of gap Priya is seeing.",
    })

    # ---- F3: monetary representation ------------------------------------
    f3_details = [
        f"{o['id']}: subtotal={o['subtotal']!r}, tax={o['tax']!r}, "
        f"shipping={o['shipping']!r}, total={o['total']!r}"
        for o in orders
        if any(isinstance(o[k], float) for k in ("subtotal", "tax", "shipping", "total"))
    ]
    findings.append({
        "id": "F3",
        "severity": "high",
        "title": "Monetary amounts are not always integer cents",
        "docs_say": "All monetary amounts are integers in the smallest unit "
                    "(54.70 USD is returned as 5470).",
        "data_does": "; ".join(f3_details) + " - floats in major units, i.e. "
                    "dollars not cents.",
        "hurts": "Strict-typed clients crash or truncate. Worse, a client that "
                 "blindly sums these as 'cents' books ord_1006 as $0.54 instead "
                 "of $53.62 - a 100x error - and mixed-unit sums are garbage.",
    })

    # ---- F4: status enum -------------------------------------------------
    f4_bad = [o["id"] for o in orders if o["status"] not in DOC_STATUSES]
    findings.append({
        "id": "F4",
        "severity": "medium",
        "title": "Order status outside the documented enum",
        "docs_say": "status is one of pending, shipped, delivered, cancelled.",
        "data_does": f"orders_page1.json: {', '.join(f4_bad)} has status "
                     f"{[o['status'] for o in orders if o['status'] not in DOC_STATUSES][0]!r}, "
                     "which the enum does not allow.",
        "hurts": "Clients that validate against the enum (or map status to an "
                 "internal enum) reject or drop the payload. It also means the "
                 "docs give no guidance on whether refunded money counts as "
                 "revenue - a finance-affecting ambiguity.",
    })

    # ---- F5: missing-order status code -----------------------------------
    findings.append({
        "id": "F5",
        "severity": "medium",
        "title": "Missing order returns HTTP 200, not 404",
        "docs_say": "GET /v1/orders/{id} returns 404 if no order with that ID exists.",
        "data_does": "order_ord_9999.json (GET /v1/orders/ord_9999, no such "
                     "order) returned status 200 with body "
                     + json.dumps(missing) + ".",
        "hurts": "Error handling keyed on status codes never fires; the caller "
                 "must inspect the body to notice the order is missing, and the "
                 "envelope shape differs from the list endpoint's order object.",
    })

    # ---- F6: email presence ----------------------------------------------
    f6_bad = [
        f"{o['id']} (customer {o['customer']['id']}, name={o['customer']['name']!r})"
        for o in orders if not o["customer"].get("email")
    ]
    findings.append({
        "id": "F6",
        "severity": "low",
        "title": "customer.email is not always present",
        "docs_say": "customer.email: The customer's email address. Always present.",
        "data_does": f"orders_page2.json: {', '.join(f6_bad)} has email=null.",
        "hurts": "Guest checkouts exist but the docs deny it. Integrations that "
                 "email receipts or match customers by email break on null.",
    })

    # ---- Revenue scenarios ----------------------------------------------
    def to_cents(o):
        v = o["total"]
        return int(round(v * 100)) if isinstance(v, float) else v

    all_orders = [dict(o, cents=to_cents(o)) for o in orders]
    refunded = [o for o in all_orders if o["status"] == "refunded"]
    fixed_1004 = [
        int(round(o["subtotal"] + o["tax"] + o["shipping"])) if o["id"] == "ord_1004" else o["cents"]
        for o in all_orders
    ]

    scenarios = {
        "A - naive sum of stored totals (all 6 orders)": sum(o["cents"] for o in all_orders),
        "B - exclude refunded ord_1003": sum(o["cents"] for o in all_orders if o["status"] != "refunded"),
        "C - B + ord_1004 corrected to component sum": sum(
            c for o, c in zip(all_orders, fixed_1004) if o["status"] != "refunded"
        ),
        "D - A + ord_1004 corrected to component sum": sum(fixed_1004),
    }

    report = {
        "orders_found": len(all_orders),
        "order_ids": [o["id"] for o in all_orders],
        "page1": {"has_more": page1["has_more"], "next_cursor": page1["next_cursor"],
                   "orders": len(page1["data"])},
        "page2": {"has_more": page2["has_more"], "next_cursor": page2["next_cursor"],
                   "orders": len(page2["data"])},
        "findings": findings,
        "worst": "F1",
        "revenue_scenarios_cents": scenarios,
        "revenue_scenarios_usd": {k: f"${v / 100:,.2f}" for k, v in scenarios.items()},
        "naive_pull_trusting_has_more": {
            "orders_seen": len(page1["data"]),
            "stated_total_cents": sum(o["total"] for o in page1["data"]),
            "usd": cents(sum(o["total"] for o in page1["data"])),
            "missing_orders": [o["id"] for o in page2["data"]],
        },
        "cannot_determine": [
            "Whether a refunded order counts as revenue - 'refunded' is not in the docs at all.",
            "Whether stored total or component sum is authoritative for ord_1004.",
            "Whether any page 3+ exists - has_more already lied once, so page 2's has_more=false cannot be trusted either.",
            "Whether ord_1006's float dollar values are cents-scaled in the dashboard or raw dollars.",
            "The dashboard's own revenue definition (gross vs net of refunds, before/after the ord_1004 fix).",
        ],
    }

    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"orders: {report['order_ids']}")
    for f in findings:
        print(f"[{f['severity'].upper():8}] {f['id']} {f['title']}")
    print("\nRevenue scenarios:")
    for k, v in scenarios.items():
        print(f"  {k}: ${v / 100:,.2f}")
    print(f"\nNaive pull trusting has_more: {report['naive_pull_trusting_has_more']['usd']} "
          f"(misses {report['naive_pull_trusting_has_more']['missing_orders']})")
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()
