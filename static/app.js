/* Mission Control front-end: fetch gateway metrics, render SVG charts, drive controls. */
const $ = (s) => document.querySelector(s);
const usd = (n) => "$" + Number(n).toFixed(4);
const clock = (ts) => new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const clockS = (ts) => new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const shortModel = (id) => id.includes("haiku") ? "Haiku" : id.includes("sonnet") ? "Sonnet" : id;

async function get(p) { return (await fetch(p)).json(); }
async function post(p, body) {
  return (await fetch(p, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })).json();
}

/* ---------------- sparkline ---------------- */
function sparkline(values, color) {
  const W = 120, H = 26, pad = 2;
  const max = Math.max(1, ...values);
  const step = (W - 2 * pad) / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [pad + i * step, H - pad - (v / max) * (H - 2 * pad)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `M${pad} ${H - pad} ` + pts.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + ` L${W - pad} ${H - pad} Z`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${area}" fill="${color}" opacity="0.12"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ---------------- main chart (requests area + cost line + tooltip) ---------------- */
let chartMeta = null;

function areaChart(buckets) {
  const W = 720, H = 210, padL = 12, padR = 12, padT = 16, padB = 24;
  const base = H - padB;
  const reqs = buckets.map((b) => b.requests);
  const costs = buckets.map((b) => b.cost);
  const maxR = Math.max(1, ...reqs);
  const maxC = Math.max(0.000001, ...costs);
  const step = (W - padL - padR) / Math.max(1, buckets.length - 1);
  const x = (i) => padL + i * step;
  const yR = (v) => base - (v / maxR) * (base - padT);
  const yC = (v) => base - (v / maxC) * (base - padT) * 0.85;

  const rPts = reqs.map((v, i) => [x(i), yR(v)]);
  const cPts = costs.map((v, i) => [x(i), yC(v)]);
  const line = (pts) => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `M${x(0)} ${base} ` + rPts.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + ` L${x(buckets.length - 1)} ${base} Z`;

  const grid = [0.33, 0.66].map((f) => {
    const y = (base - f * (base - padT)).toFixed(1);
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#edf1f6" stroke-width="1"/>`;
  }).join("");

  const ticks = [0, Math.floor(buckets.length / 2), buckets.length - 1].map((i) =>
    `<text class="axis" x="${x(i).toFixed(1)}" y="${H - 7}" text-anchor="${i === 0 ? "start" : i === buckets.length - 1 ? "end" : "middle"}">${clock(buckets[i].t)}</text>`
  ).join("");

  chartMeta = { buckets, x: (i) => x(i), step, padL, W };

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="requests and spend over time">
    <defs>
      <linearGradient id="gradB" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2563eb" stop-opacity="0.22"/>
        <stop offset="1" stop-color="#2563eb" stop-opacity="0.01"/>
      </linearGradient>
    </defs>
    ${grid}
    <line x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}" stroke="#e4e9f0" stroke-width="1"/>
    <path d="${area}" fill="url(#gradB)"/>
    <path d="${line(rPts)}" fill="none" stroke="#2563eb" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${line(cPts)}" fill="none" stroke="#059669" stroke-width="1.7" stroke-dasharray="1 5" stroke-linecap="round"/>
    ${rPts.map((p, i) => `<circle class="pt" data-i="${i}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.8" fill="#fff" stroke="#2563eb" stroke-width="1.7"/>`).join("")}
    ${ticks}
  </svg>
  <div class="tooltip" id="tt"></div>`;
}

function wireChartHover() {
  const box = $("#chart"), svg = box.querySelector("svg"), tt = $("#tt");
  if (!svg || !tt || !chartMeta) return;
  svg.addEventListener("mousemove", (e) => {
    const rect = svg.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width * chartMeta.W;
    const i = Math.max(0, Math.min(chartMeta.buckets.length - 1, Math.round((relX - chartMeta.padL) / chartMeta.step)));
    const b = chartMeta.buckets[i];
    tt.innerHTML = `${b.requests} req <span class="tt-c">${usd(b.cost)}</span><br>${clock(b.t)}`;
    tt.style.left = (chartMeta.x(i) / chartMeta.W * rect.width) + "px";
    tt.style.top = (rect.height * 0.28) + "px";
    tt.classList.add("show");
  });
  svg.addEventListener("mouseleave", () => tt.classList.remove("show"));
}

/* ---------------- donut ---------------- */
function donut(byModel) {
  const entries = Object.entries(byModel);
  const total = entries.reduce((a, [, n]) => a + n, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  const colors = { Sonnet: "#2563eb", Haiku: "#059669" };
  let offset = 0;
  const segs = entries.map(([id, n]) => {
    const frac = n / total;
    const name = shortModel(id);
    const seg = `<circle r="${R}" cx="70" cy="70" fill="none"
      stroke="${colors[name] || "#8a99ab"}" stroke-width="14"
      stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}"
      stroke-dashoffset="${(-offset * C).toFixed(2)}"
      transform="rotate(-90 70 70)" stroke-linecap="butt"/>`;
    offset += frac;
    return seg;
  }).join("");
  const legend = entries.map(([id, n]) => {
    const name = shortModel(id);
    return `<div class="dl-row">
      <i class="swatch" style="background:${colors[name] || "#8a99ab"}"></i>
      <span class="dl-name">${name}</span>
      <span class="dl-count">${n} req</span>
      <span class="dl-pct">${Math.round(n / total * 100)}%</span>
    </div>`;
  }).join("");
  const svg = `<svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="model routing share">
    <circle r="${R}" cx="70" cy="70" fill="none" stroke="#eef2f6" stroke-width="14"/>
    ${segs}
    <text x="70" y="68" text-anchor="middle" class="donut-center-num">${total}</text>
    <text x="70" y="84" text-anchor="middle" class="donut-center-label">served</text>
  </svg>`;
  return { svg, legend };
}

/* ---------------- bars ---------------- */
function bars(rows) {
  if (!rows.length) return `<p class="empty">No data yet. Send a request from the console.</p>`;
  const max = Math.max(1e-9, ...rows.map((r) => r.max ?? r.value));
  return rows.map((r) => {
    const pct = ((r.value / (r.max ?? max)) * 100).toFixed(1);
    return `<div class="bar-row">
      <span class="bar-label">${r.label}</span>
      <span class="bar-track"><span class="bar-fill ${r.tone || ""}" style="width:${pct}%"></span></span>
      <span class="bar-val">${r.display}</span>
    </div>`;
  }).join("");
}

/* ---------------- refresh ---------------- */
async function refresh() {
  if (document.hidden) return;
  const [health, stats, ts, recent, limits, ks] = await Promise.all([
    get("/health"), get("/stats"), get("/stats/timeseries"),
    get("/stats/recent"), get("/limits"), get("/killswitch"),
  ]);

  $("#mode").textContent = health.mode === "live" ? "LIVE API" : "MOCK MODE";
  $("#mode").className = "badge " + (health.mode === "live" ? "live" : "mock");
  $("#updated").textContent = "updated " + clockS(Date.now() / 1000);

  /* KPIs */
  $("#k-req").textContent = stats.total_requests.toLocaleString();
  $("#k-cost").textContent = usd(stats.total_cost_usd);
  $("#k-lat").textContent = stats.p50_ms + " ms";
  $("#k-lat-sub").textContent = "p95 " + stats.p95_ms + " ms";
  $("#k-users").textContent = stats.active_users;
  $("#k-users-sub").textContent = stats.total_tokens.toLocaleString() + " tokens";
  $("#k-sb").textContent = stats.served + " / " + stats.blocked;
  $("#k-sb-sub").textContent = stats.blocked === 0 ? "no blocks" : "rate limits + kill-switch";
  $("#k-req-spark").innerHTML = sparkline(ts.map((b) => b.requests), "#2563eb");
  $("#k-cost-spark").innerHTML = sparkline(ts.map((b) => b.cost), "#059669");

  /* chart + donut */
  $("#chart").innerHTML = areaChart(ts);
  wireChartHover();
  const d = donut(stats.by_model);
  $("#donut").innerHTML = d.svg;
  $("#donut-legend").innerHTML = d.legend;

  /* rate limits */
  $("#limits").innerHTML = bars(limits.slice(0, 5).map((r) => {
    const frac = r.used / r.limit;
    return {
      label: r.user, value: r.used, max: r.limit,
      display: `${r.used}/${r.limit}`,
      tone: frac >= 1 ? "red" : frac >= 0.7 ? "amber" : "",
    };
  }));

  /* top spenders */
  const spenders = Object.entries(stats.by_user).slice(0, 5);
  $("#spenders").innerHTML = bars(spenders.map(([u, c]) => ({
    label: u, value: c, display: usd(c), tone: "green",
  })));

  /* kill-switch */
  const spent = ks.total_spend_usd, cap = ks.cap_usd;
  const frac = cap ? Math.min(1, spent / cap) : 0;
  const tripped = ks.enabled && spent >= cap;
  const tone = tripped ? "var(--red)" : frac > 0.85 ? "#d97706" : "var(--green)";
  $("#ks").innerHTML = `
    <div class="ks-nums">
      <span class="ks-spent">${usd(spent)}</span>
      <span class="ks-cap">cap ${usd(cap)}</span>
    </div>
    <span class="ks-meter"><span style="width:${(frac * 100).toFixed(2)}%;background:${tone}"></span></span>
    <div class="ks-controls">
      <button id="ks-toggle" class="btn ghost">${ks.enabled ? "Disable" : "Enable"}</button>
      <input id="ks-cap" class="mono" value="${cap}" aria-label="spend cap in dollars" />
      <button id="ks-setcap" class="btn ghost">Set cap</button>
    </div>`;
  $("#ks-toggle").onclick = async () => { await post("/killswitch", { enabled: !ks.enabled }); refresh(); };
  $("#ks-setcap").onclick = async () => { await post("/killswitch", { cap_usd: parseFloat($("#ks-cap").value) }); refresh(); };
  $("#ks-state").textContent = tripped ? "TRIPPED" : ks.enabled ? "armed" : "off";
  $("#ks-state").className = "chip " + (tripped ? "bad" : ks.enabled ? "ok" : "warn");
  $("#ks-pill").textContent = ks.enabled ? "kill-switch armed" : "kill-switch off";
  $("#ks-pill").className = "badge " + (ks.enabled ? "ok" : "off");
  $("#ks-banner").classList.toggle("hidden", !tripped);

  /* recent table */
  $("#recent tbody").innerHTML = recent.map((r) => {
    const name = shortModel(r.model);
    return `<tr>
      <td class="mono">${clockS(r.ts)}</td>
      <td>${r.user}</td>
      <td><span class="model-chip ${name.toLowerCase()}">${name}</span></td>
      <td class="r mono">${r.status === "ok" ? (r.in + r.out).toLocaleString() : "-"}</td>
      <td class="r mono">${r.status === "ok" ? r.ms + " ms" : "-"}</td>
      <td class="r mono">${r.status === "ok" ? `<span class="cost">${usd(r.cost)}</span>` : "-"}</td>
      <td><span class="pill ${r.status}">${r.status === "rate_limited" ? "rate limited" : r.status}</span></td>
    </tr>`;
  }).join("");

  document.body.classList.add("loaded");
}

/* ---------------- console actions ---------------- */
async function sendOne() {
  const body = {
    prompt: $("#t-prompt").value,
    user_id: $("#t-user").value || "demo",
    tier: $("#t-tier").value,
    plan: $("#t-plan").value,
  };
  const res = await post("/chat", body);
  const out = $("#t-out");
  out.classList.remove("hidden");
  out.textContent = JSON.stringify(res, null, 2);
  refresh();
}

async function simulate() {
  const users = ["maria", "devon", "priya", "sam", "alex"];
  const prompts = ["easy 4 miles", "marathon long run", "threshold session", "recovery jog", "taper week plan"];
  const btn = $("#sim");
  btn.disabled = true; btn.textContent = "Simulating...";
  for (let i = 0; i < 8; i++) {
    await post("/chat", {
      prompt: prompts[i % prompts.length],
      user_id: users[Math.floor(Math.random() * users.length)],
      tier: Math.random() < 0.5 ? "strong" : "cheap",
      plan: "pro",
    });
  }
  btn.disabled = false; btn.textContent = "Simulate traffic";
  refresh();
}

$("#send").onclick = sendOne;
$("#sim").onclick = simulate;
$("#t-prompt").addEventListener("keydown", (e) => { if (e.key === "Enter") sendOne(); });

refresh();
setInterval(refresh, 4000);
