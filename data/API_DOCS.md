# Meridian Orders API

**Version 1.4**

Read access to orders for your Meridian account.

Base URL: `https://api.meridian.example/v1`

---

## The order object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier, prefixed `ord_` |
| `created_at` | string | ISO 8601 timestamp in UTC |
| `status` | string | One of `pending`, `shipped`, `delivered`, `cancelled` |
| `currency` | string | Three letter ISO currency code |
| `subtotal` | integer | Sum of line items |
| `tax` | integer | Tax applied |
| `shipping` | integer | Shipping charge |
| `total` | integer | Amount charged. Always equals `subtotal` + `tax` + `shipping`. |
| `line_items` | array | The items in the order |
| `customer` | object | The customer who placed the order |

All monetary amounts are integers in the smallest unit of the currency. An order
totalling 54.70 US dollars is returned as `5470`.

### The customer object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier, prefixed `cus_` |
| `email` | string | The customer's email address. Always present. |
| `name` | string | The customer's full name |

---

## Pagination

List endpoints return at most 25 orders per page.

```json
{
  "object": "list",
  "data": [ ... ],
  "has_more": true,
  "next_cursor": "cur_8f2a19bd"
}
```

Check `has_more` to decide whether to request another page. When it is `true`,
pass `next_cursor` as the `starting_after` parameter to fetch the next page.

---

## Endpoints

### `GET /v1/orders`

Returns a paginated list of orders, most recent first.

### `GET /v1/orders/{id}`

Returns a single order. Returns `404` if no order with that ID exists.
