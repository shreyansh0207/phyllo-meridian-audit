# BUG: `GET /v1/orders` paginates early — `has_more: false` while more pages exist

| | |
|---|---|
| **Severity** | High — silent data loss for every client that follows the docs |
| **Endpoint** | `GET /v1/orders` |
| **Area** | List pagination / response serialization |

## Summary

The list endpoint returns `has_more: false` on a page that has a subsequent
page. Any client implementing the documented contract stops paginating and
permanently misses orders. No error is raised.

## Reproduction

1. `GET /v1/orders` → returns 4 orders (`ord_1001`–`ord_1004`),
   `"has_more": false`, `"next_cursor": "cur_8f2a19bd"`.
2. `GET /v1/orders?starting_after=cur_8f2a19bd` → returns 2 **further** orders
   (`ord_1005`, `ord_1006`), `"has_more": false`, `"next_cursor": null`.

Captured payloads: `responses/orders_page1.json`, `responses/orders_page2.json`
(see `candidate-pack/README.md` for the request that produced each).

## Expected

`has_more` is `true` whenever rows remain after the current page, and
`next_cursor` is present only when `has_more` is `true`. This is what
`API_DOCS.md` promises: *"Check `has_more` to decide whether to request
another page. When it is `true`, pass `next_cursor` as the `starting_after`
parameter to fetch the next page."*

## Actual

Page 1 returns `has_more: false` together with a valid `next_cursor`, and the
next page exists and returns data. A conforming client stops after page 1 and
silently drops `ord_1005` and `ord_1006` — **$79.09 in stated totals** on this
capture (24% of orders, 24% of revenue).

## Impact

- Every integration that trusts `has_more` undercounts. On this capture that
  is 2 of 6 orders.
- Downstream finance reconciliation fails: totals pulled through the API do
  not match the Meridian dashboard (see TICKET-4502).
- The failure is silent — nothing is logged — and because the flag has
  already been wrong once, page 2's `has_more: false` cannot be trusted
  either, so the full production extent of the loss is unknown client-side.

## Suggested fix

- Set `has_more` from whether any rows remain after the current page
  (e.g. `has_more = rows_fetched == page_size` or an explicit existence
  check), not from a value computed before pagination is applied.
- Only serialize `next_cursor` when `has_more` is `true`.
- Add a contract test: `has_more == false` ⟹ a request using the previous
  page's cursor returns an empty page.

## Related defect (same capture, flag for the data team)

`GET /v1/orders/ord_1004` returns `total: 6810` while
`subtotal + tax + shipping = 6200 + 511 + 599 = 7310` — a $5.00
inconsistency against the documented invariant
*"total always equals subtotal + tax + shipping"*. Either the stored total or
a component is wrong; consumers cannot tell which is authoritative.
