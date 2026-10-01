# Email to Priya (TICKET-4502)

**Subject:** Your Meridian report vs. the dashboard — three concrete causes

Hi Priya,

I pulled the same orders through the Meridian API and found three things that
each move the total. Together they plausibly account for the gap you're seeing.

**1. The API quietly hides orders.** When a page says there are no more
orders, it can be wrong. Page two of your pull contains two real orders —
$25.47 and $53.62 — that a report following the documented behaviour never
sees. That alone is **$79.09 missing** before anything else.

**2. One order's total doesn't match its own parts.** Order ord_1004 is
stored as $68.10, but its items, tax and shipping add up to $73.10. A
**$5.00 difference** that depends purely on which figure the dashboard uses.

**3. One order was refunded.** ord_1003 ($102.33) carries a status the
documentation never mentions, so one report may include it as revenue while
another excludes it — up to a **$102.33 swing**.

I can't confirm the exact size of your discrepancy without knowing which of
these your report and the dashboard each apply. But each mechanism is real,
visible in the raw payloads, and independently fixable. I'd ask Meridian for
a corrected pagination flag and a ruling on whether refunds count, and
reconcile ord_1004 against the ledger.

Happy to walk through the numbers.

Best,
Shreyansh
