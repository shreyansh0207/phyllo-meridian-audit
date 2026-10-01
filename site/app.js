/* ============ Phyllo × Meridian Audit — interactions ============ */
"use strict";

/* ---------- real data from data/*.json ---------- */

const PAGE1 = {
  object: "list",
  has_more: false,
  next_cursor: "cur_8f2a19bd",
  data: [
    { id: "ord_1001", created_at: "2026-03-14T09:21:00Z", status: "shipped", currency: "USD",
      subtotal: 4500, tax: 371, shipping: 599, total: 5470,
      item: "Cedar desk organiser", qty: 1, customer: "Rina Okafor" },
    { id: "ord_1002", created_at: "2026-03-14T11:05:00Z", status: "delivered", currency: "USD",
      subtotal: 2200, tax: 181, shipping: 0, total: 2381,
      item: "Linen tea towel, set of 2", qty: 2, customer: "Tigist Abebe" },
    { id: "ord_1003", created_at: "2026-03-14T13:47:12Z", status: "refunded", currency: "USD",
      subtotal: 8900, tax: 734, shipping: 599, total: 10233,
      item: "Walnut serving board", qty: 1, customer: "Johan Lindqvist" },
    { id: "ord_1004", created_at: "2026-03-15T08:02:44Z", status: "shipped", currency: "USD",
      subtotal: 6200, tax: 511, shipping: 599, total: 6810,
      item: "Stoneware mug", qty: 4, customer: "Mateo Dela Cruz" },
  ],
};

const PAGE2 = {
  object: "list",
  has_more: false,
  next_cursor: null,
  data: [
    { id: "ord_1005", created_at: "2026-03-15T14:12:09Z", status: "delivered", currency: "USD",
      subtotal: 1800, tax: 148, shipping: 599, total: 2547,
      item: "Cotton dish cloth", qty: 3, customer: "Guest" },
    { id: "ord_1006", created_at: "2026-03-16T10:41:00Z", status: "shipped", currency: "USD",
      subtotal: 44.0, tax: 3.63, shipping: 5.99, total: 53.62,
      item: "Cedar desk organiser", qty: 1, customer: "Piotr Nowak" },
  ],
};

const ORDERS = [...PAGE1.data, ...PAGE2.data];
const usd = (cents) => "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- findings ---------- */

const FINDINGS = [
  {
    id: "F1", sev: "critical", worst: true,
    title: "Pagination stops early — has_more: false while more orders exist",
    docs: "Check has_more to decide whether to request another page. When it is true, pass next_cursor as starting_after to fetch the next page.",
    data: "orders_page1.json returns has_more: <code>false</code> — yet also returns next_cursor: <code>cur_8f2a19bd</code>, and the capture made with that cursor (orders_page2.json) contains two more real orders: ord_1005 and ord_1006.",
    hurts: "A client following the docs stops after page 1 and silently loses every later order — here 2 of 6 orders and $79.09 of stated totals. No error is raised anywhere, so the undercount is invisible. It also means page 2's has_more can no longer be trusted either, so a page 3 can't be ruled out.",
  },
  {
    id: "F2", sev: "high", worst: false,
    title: "total does not always equal subtotal + tax + shipping",
    docs: "total: Amount charged. Always equals subtotal + tax + shipping.",
    data: "ord_1004: 6200 + 511 + 599 = 7310 ($73.10), but the stored total is 6810 ($68.10) — a $5.00 gap inside a single order.",
    hurts: "Anyone recomputing the total from its components gets a different number than the stored total. Summing totals vs summing components disagree by $5.00 on this capture — precisely the kind of unexplained gap a finance team chases for days.",
  },
  {
    id: "F3", sev: "high", worst: false,
    title: "Monetary amounts are not always integer cents",
    docs: "All monetary amounts are integers in the smallest unit of the currency. An order totalling 54.70 USD is returned as 5470.",
    data: "ord_1006 returns floats in dollars: subtotal 44.0, tax 3.63, shipping 5.99, total 53.62 — not integer cents like every other order.",
    hurts: "Strict-typed clients crash or truncate. Worse, a client that blindly sums these as cents books ord_1006 as $0.54 instead of $53.62 — a 100× error — and any sum mixing both representations is garbage.",
  },
  {
    id: "F4", sev: "medium", worst: false,
    title: "Order status outside the documented enum",
    docs: "status is one of pending, shipped, delivered, cancelled.",
    data: "ord_1003 carries status refunded, which the enum does not allow.",
    hurts: "Clients validating or mapping the enum reject or drop the payload. It also leaves the money question unanswered: do refunds count as revenue? The docs give no rule, so two reports can legitimately disagree by $102.33.",
  },
  {
    id: "F5", sev: "medium", worst: false,
    title: "A missing order returns HTTP 200, not 404",
    docs: "GET /v1/orders/{id} returns 404 if no order with that ID exists.",
    data: "order_ord_9999.json (GET /v1/orders/ord_9999 — no such order) came back with status 200 and body { \"order\": null }, in a different envelope from the list endpoint's order objects.",
    hurts: "Error handling keyed on status codes never fires. Callers must inspect response bodies to notice a missing order — and the wrapper shape differs from every other order representation.",
  },
  {
    id: "F6", sev: "low", worst: false,
    title: "customer.email is not “always present”",
    docs: "customer.email: The customer's email address. Always present.",
    data: "ord_1005 (customer cus_505, name \"Guest\") has email: null.",
    hurts: "Guest checkouts exist but the docs deny it. Integrations that email receipts or match customers by email break on null.",
  },
];

/* ---------- hero ticker ---------- */

(function ticker() {
  const el = document.getElementById("ticker");
  if (!el) return;
  const flags = { ord_1003: "⚠ refunded", ord_1004: "⚠ $5.00 off", ord_1005: "⚠ guest", ord_1006: "⚠ float $" };
  const items = ORDERS.map((o) => `<span><b>${o.id}</b> · ${o.status} · ${usd(o.total)}${flags[o.id] ? ` · <span class="flag">${flags[o.id]}</span>` : ""}</span>`);
  const seq = items.join('<span style="color:#3a3f52">///</span>');
  el.innerHTML = seq + '<span style="color:#3a3f52">///</span>' + seq;
})();

/* ---------- particle field ---------- */

(function particles() {
  const cv = document.getElementById("particles");
  if (!cv || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = cv.getContext("2d");
  let W, H, pts;
  const N = 70, LINK = 130;

  function resize() {
    W = cv.width = innerWidth * devicePixelRatio;
    H = cv.height = innerHeight * devicePixelRatio;
    cv.style.width = innerWidth + "px";
    cv.style.height = innerHeight + "px";
  }
  resize();
  addEventListener("resize", resize);

  pts = Array.from({ length: N }, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight,
    vx: (Math.random() - 0.5) * 0.28,
    vy: (Math.random() - 0.5) * 0.28,
    r: Math.random() * 1.6 + 0.6,
  }));

  (function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.scale(devicePixelRatio, devicePixelRatio);
    for (let i = 0; i < N; i++) {
      const p = pts[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > innerWidth) p.vx *= -1;
      if (p.y < 0 || p.y > innerHeight) p.vy *= -1;
      for (let j = i + 1; j < N; j++) {
        const q = pts[j], dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
        if (d < LINK) {
          ctx.strokeStyle = `rgba(139, 92, 246, ${(1 - d / LINK) * 0.16})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
      ctx.fillStyle = "rgba(160, 150, 255, 0.55)";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    requestAnimationFrame(draw);
  })();
})();

/* ---------- scroll reveal ---------- */

(function reveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll(".rv").forEach((el) => io.observe(el));
})();

/* ---------- animated counters ---------- */

(function counters() {
  const els = document.querySelectorAll("[data-count]");
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      const el = entry.target;
      const target = parseFloat(el.dataset.count);
      const money = el.dataset.fmt === "money";
      const dec = money ? 2 : 0;
      const dur = 1400, t0 = performance.now();
      (function step(t) {
        const k = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - k, 4);
        const v = target * eased;
        el.textContent = money
          ? "$" + v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })
          : Math.round(v).toLocaleString("en-US");
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    });
  }, { threshold: 0.4 });
  els.forEach((el) => io.observe(el));
})();

/* ---------- findings accordion + tilt ---------- */

(function findings() {
  const wrap = document.getElementById("findings");
  if (!wrap) return;

  FINDINGS.forEach((f, i) => {
    const card = document.createElement("div");
    card.className = "finding rv" + (f.worst ? " worst" : "");
    card.dataset.d = String((i % 3) + 1);
    card.innerHTML = `
      <div class="top">
        <span class="fid">${f.id}</span>
        <span class="sev ${f.sev}">${f.sev}</span>
        ${f.worst ? '<span class="worst-chip">Worst one</span>' : ""}
        <span class="ftitle">${f.title}</span>
        <span class="chev">+</span>
      </div>
      <div class="body"><div class="body-in">
        <div class="fblock say"><h4>The docs say</h4><p>“${f.docs}”</p></div>
        <div class="fblock does"><h4>The data does</h4><p>${f.data}</p></div>
        <div class="fblock hurt"><h4>Who gets hurt, and why</h4><p>${f.hurts}</p></div>
      </div></div>`;
    wrap.appendChild(card);

    const top = card.querySelector(".top");
    const body = card.querySelector(".body");
    top.addEventListener("click", () => {
      const open = card.classList.toggle("open");
      body.style.maxHeight = open ? body.scrollHeight + "px" : "0px";
    });

    // premium tilt
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches && matchMedia("(pointer: fine)").matches) {
      card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        const rx = ((e.clientY - r.top) / r.height - 0.5) * -3.2;
        const ry = ((e.clientX - r.left) / r.width - 0.5) * 3.2;
        card.style.transform = `perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      });
      card.addEventListener("mouseleave", () => { card.style.transform = ""; });
    }
  });

  // open the worst finding by default
  const worst = wrap.querySelector(".finding.worst");
  if (worst) {
    requestAnimationFrame(() => {
      worst.classList.add("open");
      const b = worst.querySelector(".body");
      b.style.maxHeight = b.scrollHeight + "px";
    });
  }
})();

/* ---------- revenue lab ---------- */

const Lab = (() => {
  const state = { excludeRefund: true, correct1004: true, convert1006: true };
  let shown = { total: 0 };

  function orderCents(o) {
    let c;
    if (o.id === "ord_1006" && !state.convert1006) c = Math.round(o.total); // the 100× trap
    else if (typeof o.total === "number" && !Number.isInteger(o.total)) c = Math.round(o.total * 100);
    else c = o.total;
    if (o.id === "ord_1004" && state.correct1004) c = Math.round(o.subtotal + o.tax + o.shipping);
    return c;
  }

  function compute() {
    let total = 0;
    const rows = ORDERS.map((o) => {
      const excluded = state.excludeRefund && o.status === "refunded";
      const c = orderCents(o);
      if (!excluded) total += c;
      let note = "";
      if (o.id === "ord_1004" && state.correct1004) note = "component sum";
      if (o.id === "ord_1006") note = state.convert1006 ? "dollars → cents" : "read as cents ✗";
      if (o.status === "refunded") note = state.excludeRefund ? "refund excluded" : "refund included";
      return { id: o.id, cents: c, excluded, note };
    });
    const scen =
      !state.excludeRefund && !state.correct1004 && state.convert1006 ? "Scenario A — naive sum of stored totals" :
      state.excludeRefund && !state.correct1004 && state.convert1006 ? "Scenario B — refund excluded" :
      state.excludeRefund && state.correct1004 && state.convert1006 ? "Scenario C — my answer" :
      !state.excludeRefund && state.correct1004 && state.convert1006 ? "Scenario D — refund in, ord_1004 fixed" :
      "Custom combination — not one I'd submit";
    return { total, rows, scen };
  }

  function render() {
    const { total, rows, scen } = compute();
    const valEl = document.getElementById("lab-total");
    const scenEl = document.getElementById("lab-scen");
    const from = shown.total, to = total, t0 = performance.now(), dur = 750;
    scenEl.textContent = scen;
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur), eased = 1 - Math.pow(1 - k, 3);
      valEl.textContent = usd(Math.round(from + (to - from) * eased));
      if (k < 1) requestAnimationFrame(step);
      else shown.total = to;
    })(t0);

    const max = Math.max(...rows.map((r) => r.cents));
    const bars = document.getElementById("lab-bars");
    bars.innerHTML = "";
    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "bar-row" + (r.excluded ? " excluded" : "");
      row.innerHTML = `
        <span class="bid">${r.id}</span>
        <div class="bar-track"><div class="bar-fill" style="width:0%"></div></div>
        <span class="bamt">${usd(r.cents)}${r.note ? `<span class="bar-tag">${r.note}</span>` : ""}</span>`;
      bars.appendChild(row);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        row.querySelector(".bar-fill").style.width = Math.max(2, (r.cents / max) * 100) + "%";
      }));
    });
  }

  function bind() {
    document.querySelectorAll(".toggle-row").forEach((row) => {
      row.addEventListener("click", () => {
        row.classList.toggle("on");
        state[row.dataset.key] = row.classList.contains("on");
        render();
      });
    });
    render();
  }

  return { bind };
})();

document.addEventListener("DOMContentLoaded", Lab.bind);

/* ---------- evidence viewer ---------- */

(function evidence() {
  const box = document.getElementById("codebox");
  if (!box) return;

  const FLAG_TOOLTIPS = {
    refunded: "F4 — status outside the documented enum",
    "53.62": "F3 — float dollars, not integer cents",
    "44.0": "F3 — float dollars, not integer cents",
    "3.63": "F3 — float dollars, not integer cents",
    "5.99": "F3 — float dollars, not integer cents",
    "6810": "F2 — components sum to 7310, not 6810",
    "false": "F1 — has_more lies: a next page exists",
    "cur_8f2a19bd": "F1 — cursor valid, yet has_more said stop",
    "null": "F5/F6 — 200 with null body · guest email missing",
  };

  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function highlight(json) {
    let html = esc(JSON.stringify(json, null, 2));
    html = html.replace(
      /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")\s*:|("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")|(-?\d+(?:\.\d+)?)|\b(null|true|false)\b/g,
      (m, key, str, num, lit) => {
        if (key !== undefined) return `<span class="tok-key">${key}</span>:`;
        if (str !== undefined) {
          const inner = str.slice(1, -1);
          if (FLAG_TOOLTIPS[inner] !== undefined)
            return `<span class="tok-flag${inner === "false" || inner === "null" ? "" : " warn"}" title="${FLAG_TOOLTIPS[inner]}">${str}</span>`;
          return `<span class="tok-str">${str}</span>`;
        }
        if (num !== undefined) {
          if (FLAG_TOOLTIPS[num] !== undefined)
            return `<span class="tok-flag warn" title="${FLAG_TOOLTIPS[num]}">${num}</span>`;
          return `<span class="tok-num">${num}</span>`;
        }
        if (FLAG_TOOLTIPS[lit] !== undefined)
          return `<span class="tok-flag" title="${FLAG_TOOLTIPS[lit]}">${lit}</span>`;
        return `<span class="tok-null">${lit}</span>`;
      }
    );
    return html;
  }

  const SOURCES = {
    "orders_page1.json": PAGE1,
    "orders_page2.json": PAGE2,
    "order_ord_9999.json": { order: null, _meta: "GET /v1/orders/ord_9999 — HTTP 200 (docs promise 404)" },
  };

  document.querySelectorAll("#evidence-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#evidence-tabs .tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const src = SOURCES[tab.dataset.src];
      if (src && src._meta) {
        box.innerHTML = `<span class="ln" style="color:var(--ink-faint)">// ${src._meta}</span>` +
          highlight({ order: null }).split("\n").map((l) => `<span class="ln">${l || " "}</span>`).join("");
      } else {
        box.innerHTML = highlight(src).split("\n").map((l) => `<span class="ln">${l || " "}</span>`).join("");
      }
    });
  });

  // initial render
  const first = document.querySelector("#evidence-tabs .tab");
  if (first) first.click();
})();

/* ---------- deliverables ---------- */

(function deliverables() {
  const pane = document.getElementById("deliv-pane");
  if (!pane) return;

  const DOCS = {
    priya: `
      <div class="doc-render">
        <span class="meta">TICKET-4502 · customer reply · finance-friendly</span>
        <h1>Re: monthly revenue report won’t reconcile</h1>
        <p>Hi Priya,</p>
        <p>I pulled the same orders through the Meridian API and found three things that each move the total. Together they plausibly account for the gap you’re seeing.</p>
        <h2>1. The API quietly hides orders</h2>
        <p>When a page says there are no more orders, it can be wrong. Page two of your pull contains two real orders — <strong>$25.47 and $53.62</strong> — that a report following the documented behaviour never sees. That alone is <strong>$79.09 missing</strong> before anything else.</p>
        <h2>2. One order’s total doesn’t match its own parts</h2>
        <p>Order <strong>ord_1004</strong> is stored as $68.10, but its items, tax and shipping add up to $73.10 — a <strong>$5.00 difference</strong> that depends purely on which figure the dashboard uses.</p>
        <h2>3. One order was refunded</h2>
        <p><strong>ord_1003</strong> ($102.33) carries a status the documentation never mentions, so one report may count it as revenue while another excludes it — up to a <strong>$102.33 swing</strong>.</p>
        <p>I can’t confirm the exact size of your discrepancy without knowing which of these your report and the dashboard each apply. But each mechanism is real, visible in the raw payloads, and independently fixable. I’d ask Meridian for a corrected pagination flag and a ruling on whether refunds count, and I’d reconcile ord_1004 against the ledger.</p>
        <p>Happy to walk through the numbers.</p>
        <p>Best,<br><strong>Shreyansh</strong></p>
      </div>`,
    bug: `
      <div class="doc-render">
        <span class="meta">Severity: HIGH · silent data loss · GET /v1/orders</span>
        <h1>BUG: pagination terminates early — has_more: false while more pages exist</h1>
        <p><strong>Summary.</strong> The list endpoint returns <em>has_more: false</em> on a page that has a subsequent page. Clients implementing the documented contract stop paginating and permanently miss orders. No error is raised.</p>
        <h2>Reproduction</h2>
        <ol>
          <li><code>GET /v1/orders</code> → 4 orders (ord_1001–ord_1004), <em>has_more: false</em>, <em>next_cursor: "cur_8f2a19bd"</em></li>
          <li><code>GET /v1/orders?starting_after=cur_8f2a19bd</code> → <strong>2 further orders</strong> (ord_1005, ord_1006), has_more: false, next_cursor: null</li>
        </ol>
        <h2>Expected</h2>
        <p><em>has_more</em> is true whenever rows remain after the current page; <em>next_cursor</em> is present only when <em>has_more</em> is true — exactly what API_DOCS.md describes.</p>
        <h2>Actual</h2>
        <p>Page 1 returns has_more: false with a valid next_cursor, and the next page exists. A conforming client stops after page 1 and silently drops ord_1005 and ord_1006 — <strong>$79.09 of stated totals</strong> on this capture (2 of 6 orders).</p>
        <h2>Impact</h2>
        <ul>
          <li>Every integration that trusts <em>has_more</em> undercounts.</li>
          <li>Finance reconciliation fails downstream (TICKET-4502): API totals don’t match the dashboard.</li>
          <li>Failure is silent — and since the flag already lied once, page 2’s has_more: false can’t be trusted either, so total production loss is unknown client-side.</li>
        </ul>
        <h2>Suggested fix</h2>
        <ol>
          <li>Set <em>has_more</em> from whether rows remain after the current page, not a pre-pagination value.</li>
          <li>Only serialize <em>next_cursor</em> when <em>has_more</em> is true.</li>
          <li>Add a contract test: <em>has_more == false</em> ⟹ a request with the previous cursor returns an empty page.</li>
        </ol>
        <h2>Related defect (same capture)</h2>
        <p>ord_1004: stored total 6810 vs components 6200+511+599 = 7310 ($5.00). Flag for the data team — consumers can’t tell which figure is authoritative.</p>
      </div>`,
  };

  const PLAIN = {
    priya: `Subject: Your Meridian report vs. the dashboard — three concrete causes

Hi Priya,

I pulled the same orders through the Meridian API and found three things that each move the total. Together they plausibly account for the gap you're seeing.

1. The API quietly hides orders. When a page says there are no more orders, it can be wrong. Page two of your pull contains two real orders — $25.47 and $53.62 — that a report following the documented behaviour never sees. That alone is $79.09 missing before anything else.

2. One order's total doesn't match its own parts. Order ord_1004 is stored as $68.10, but its items, tax and shipping add up to $73.10 — a $5.00 difference that depends purely on which figure the dashboard uses.

3. One order was refunded. ord_1003 ($102.33) carries a status the documentation never mentions, so one report may count it as revenue while another excludes it — up to a $102.33 swing.

I can't confirm the exact size of your discrepancy without knowing which of these your report and the dashboard each apply. But each mechanism is real, visible in the raw payloads, and independently fixable. I'd ask Meridian for a corrected pagination flag and a ruling on whether refunds count, and I'd reconcile ord_1004 against the ledger.

Happy to walk through the numbers.

Best,
Shreyansh`,
    bug: `BUG: GET /v1/orders paginates early — has_more: false while more pages exist
Severity: High — silent data loss for every client that follows the docs

SUMMARY
The list endpoint returns has_more: false on a page that has a subsequent page. Clients implementing the documented contract stop paginating and permanently miss orders. No error is raised.

REPRODUCTION
1. GET /v1/orders -> 4 orders (ord_1001-ord_1004), "has_more": false, "next_cursor": "cur_8f2a19bd"
2. GET /v1/orders?starting_after=cur_8f2a19bd -> 2 further orders (ord_1005, ord_1006)

EXPECTED
has_more is true whenever rows remain after the current page; next_cursor is present only when has_more is true (per API_DOCS.md).

ACTUAL
Page 1 returns has_more: false with a valid next_cursor, and the next page exists. A conforming client stops after page 1 and silently drops ord_1005 and ord_1006 — $79.09 in stated totals on this capture (2 of 6 orders).

IMPACT
- Every integration that trusts has_more undercounts.
- Finance reconciliation fails downstream (TICKET-4502): API totals don't match the dashboard.
- The failure is silent, and page 2's has_more: false can't be trusted either, so total production loss is unknown client-side.

SUGGESTED FIX
- Set has_more from whether rows remain after the current page.
- Only serialize next_cursor when has_more is true.
- Contract test: has_more == false => cursor request returns an empty page.

RELATED DEFECT
GET /v1/orders/ord_1004 returns total 6810 while subtotal+tax+shipping = 7310 ($5.00). Either the stored total or a component is wrong; flag for the data team.`,
  };

  document.querySelectorAll("#deliv-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#deliv-tabs .tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      pane.innerHTML = DOCS[tab.dataset.doc];
      pane.dataset.current = tab.dataset.doc;
      const btn = document.getElementById("copy-btn");
      btn.classList.remove("done");
      btn.textContent = "copy as markdown";
    });
  });

  document.getElementById("copy-btn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const key = pane.dataset.current || "priya";
    const text = PLAIN[key];
    const done = () => { btn.classList.add("done"); btn.textContent = "copied ✓"; };
    const fail = () => { btn.textContent = "select & copy manually"; };
    try {
      await navigator.clipboard.writeText(text);
      done();
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        ok ? done() : fail();
      } catch { fail(); }
    }
  });

  const first = document.querySelector("#deliv-tabs .tab");
  if (first) first.click();
})();
