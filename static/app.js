const $ = (s) => document.querySelector(s);
const usd = (n) => "$" + Number(n).toFixed(4);
const shortModel = (id) => id.includes("haiku") ? "Haiku" : id.includes("sonnet") ? "Sonnet" : id;

async function get(p) { return (await fetch(p)).json(); }
async function post(p, body) {
  return (await fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
}

/* ---------- SVG area chart (requests over time) ---------- */
function areaChart(buckets) {
  const W = 680, H = 190, pad = 10, base = H - pad - 4;
  const vals = buckets.map((b) => b.requests);
  const max = Math.max(1, ...vals);
  const step = (W - 2 * pad) / Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => [pad + i * step, base - (v / max) * (base - pad - 10)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `M${pad} ${base} ` + pts.map((p) => "L" + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + ` L${W - pad} ${base} Z`;
  const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="${pad}" y1="${(base - f * (base - pad - 10)).toFixed(1)}" x2="${W - pad}" y2="${(base - f * (base - pad - 10)).toFixed(1)}" stroke="#eef2f7" stroke-width="1"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="requests over time">
    <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2563eb" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#2563eb" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#grad)"/>
    <path d="${line}" fill="none" stroke="#2563eb" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" fill="#fff" stroke="#2563eb" stroke-width="1.6"/>`).join("")}
  </svg>`;
}

function bars(rows) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) =>
    `<div class="bar-row"><span class="bar-label">${r.label}</span>
      <span class="bar-track"><span class="bar-fill ${r.green ? "green" : ""}" style="width:${(r.value / max * 100).toFixed(1)}%"></span></span>
      <span class="bar-val">${r.display}</span></div>`).join("");
}

/* ---------- renderers ---------- */
async function refresh() {
  const [stats, ts, recent, limits, ks] = await Promise.all([
    get("/stats"), get("/stats/timeseries"), get("/stats/recent"), get("/limits"), get("/killswitch"),
  ]);
  const health = await get("/health");

  $("#mode").textContent = health.mode === "live" ? "LIVE" : "MOCK";
  $("#mode").className = "badge " + (health.mode === "live" ? "live" : "mock");

  $("#k-req").textContent = stats.total_requests.toLocaleString();
  $("#k-cost").textContent = usd(stats.total_cost_usd);
  $("#k-users").textContent = stats.active_users;
  $("#k-sb").textContent = `${stats.served} / ${stats.blocked}`;

  $("#chart").innerHTML = areaChart(ts);

  $("#models").innerHTML = bars(Object.entries(stats.by_model)
    .map(([id, n]) => ({ label: shortModel(id), value: n, display: n })));

  $("#limits").innerHTML = limits.length
    ? bars(limits.slice(0, 6).map((r) => ({ label: r.user, value: r.used, display: `${r.used}/${r.limit}`, green: false })))
    : `<p class="hint">No usage yet. Send a request below.</p>`;

  // kill-switch
  const pct = Math.min(100, ks.cap_usd ? (ks.total_spend_usd / ks.cap_usd * 100) : 0);
  const tripped = ks.enabled && ks.total_spend_usd >= ks.cap_usd;
  $("#ks").innerHTML = `
    <div class="ks-spend"><span>${usd(ks.total_spend_usd)}</span><span class="cap">cap ${usd(ks.cap_usd)}</span></div>
    <span class="bar-track"><span class="bar-fill ${tripped ? "" : "green"}" style="width:${pct.toFixed(1)}%;${tripped ? "background:var(--red)" : ""}"></span></span>
    <div class="ks-controls">
      <button id="ks-toggle" class="btn ghost">${ks.enabled ? "Disable" : "Enable"}</button>
      <input id="ks-cap" class="mono" value="${ks.cap_usd}" />
      <button id="ks-setcap" class="btn ghost">Set cap</button>
    </div>`;
  $("#ks-toggle").onclick = async () => { await post("/killswitch", { enabled: !ks.enabled }); refresh(); };
  $("#ks-setcap").onclick = async () => { await post("/killswitch", { cap_usd: parseFloat($("#ks-cap").value) }); refresh(); };

  $("#ks-pill").textContent = ks.enabled ? "kill-switch on" : "kill-switch off";
  $("#ks-pill").className = "badge " + (ks.enabled ? "ok" : "off");
  $("#ks-banner").classList.toggle("hidden", !tripped);

  $("#recent tbody").innerHTML = recent.map((r) => {
    const t = new Date(r.ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `<tr><td class="mono">${t}</td><td>${r.user}</td><td>${shortModel(r.model)}</td>
      <td class="r mono">${r.in}</td><td class="r mono">${r.out}</td>
      <td class="r mono">${r.status === "ok" ? usd(r.cost) : "-"}</td>
      <td><span class="pill ${r.status}">${r.status}</span></td></tr>`;
  }).join("");
}

/* ---------- actions ---------- */
async function sendOne() {
  const body = { prompt: $("#t-prompt").value, user_id: $("#t-user").value, tier: $("#t-tier").value, plan: $("#t-plan").value };
  const res = await post("/chat", body);
  const out = $("#t-out"); out.classList.remove("hidden");
  out.textContent = JSON.stringify(res, null, 2);
  refresh();
}

async function simulate() {
  const users = ["maria", "devon", "priya", "sam", "alex"];
  const prompts = ["easy 4 miles", "marathon long run", "threshold session", "recovery jog", "taper week plan"];
  for (let i = 0; i < 8; i++) {
    await post("/chat", {
      prompt: prompts[i % prompts.length],
      user_id: users[Math.floor(Math.random() * users.length)],
      tier: Math.random() < 0.5 ? "strong" : "cheap",
      plan: "pro",
    });
  }
  refresh();
}

$("#send").onclick = sendOne;
$("#sim").onclick = simulate;
refresh();
setInterval(refresh, 4000);
