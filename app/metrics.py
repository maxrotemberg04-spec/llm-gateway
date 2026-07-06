"""In-memory request log + aggregations that feed the dashboard.

Every request (served, rate-limited, or blocked) is recorded with tokens,
cost, and latency. The dashboard reads summary / timeseries / recent off this.
"""
import random
import threading
import time

from .config import MODELS
from .cost import price

_lock = threading.Lock()
_records = []   # each: ts, user, plan, tier, model, in, out, cost, ms, status


def record(user, plan, tier, model, in_tok, out_tok, ms, status) -> float:
    usd = price(model, in_tok, out_tok) if status == "ok" else 0.0
    with _lock:
        _records.append({
            "ts": time.time(), "user": user, "plan": plan, "tier": tier,
            "model": model["id"], "in": in_tok, "out": out_tok,
            "cost": usd, "ms": int(ms), "status": status,
        })
    return usd


def total_spend() -> float:
    with _lock:
        return sum(r["cost"] for r in _records)


def _percentile(sorted_vals, pct):
    if not sorted_vals:
        return 0
    idx = min(len(sorted_vals) - 1, round(pct / 100 * (len(sorted_vals) - 1)))
    return sorted_vals[idx]


def summary() -> dict:
    with _lock:
        recs = list(_records)
    ok = [r for r in recs if r["status"] == "ok"]
    by_model, by_user = {}, {}
    for r in ok:
        by_model[r["model"]] = by_model.get(r["model"], 0) + 1
        by_user[r["user"]] = by_user.get(r["user"], 0.0) + r["cost"]
    lat = sorted(r["ms"] for r in ok)
    return {
        "total_requests": len(recs),
        "served": len(ok),
        "blocked": len(recs) - len(ok),
        "total_cost_usd": round(sum(r["cost"] for r in ok), 6),
        "total_tokens": sum(r["in"] + r["out"] for r in ok),
        "active_users": len(by_user),
        "p50_ms": _percentile(lat, 50),
        "p95_ms": _percentile(lat, 95),
        "by_model": by_model,
        "by_user": {u: round(c, 6) for u, c in
                    sorted(by_user.items(), key=lambda kv: kv[1], reverse=True)},
    }


def timeseries(buckets: int = 14) -> list:
    with _lock:
        recs = list(_records)
    now = time.time()
    if not recs:
        return [{"t": now, "requests": 0, "cost": 0.0} for _ in range(buckets)]
    span = max(120.0, now - recs[0]["ts"] + 1)
    width = span / buckets
    out = [{"t": now - span + (i + 1) * width, "requests": 0, "cost": 0.0}
           for i in range(buckets)]
    for r in recs:
        idx = min(max(int((r["ts"] - (now - span)) / width), 0), buckets - 1)
        out[idx]["requests"] += 1
        out[idx]["cost"] += r["cost"]
    for b in out:
        b["cost"] = round(b["cost"], 6)
    return out


def recent(n: int = 14) -> list:
    with _lock:
        return [dict(r) for r in _records[-n:][::-1]]


def seed_demo() -> None:
    """Populate ~28 mock requests over the last few minutes so the dashboard
    opens looking alive. Latencies are synthesized (labeled mock data)."""
    now = time.time()
    users = ["maria", "devon", "priya", "sam"]
    with _lock:
        for i in range(28):
            tier = random.choice(["strong", "cheap"])
            model = MODELS[tier]
            in_tok, out_tok = random.randint(20, 400), random.randint(30, 800)
            ms = random.randint(300, 1600) if tier == "strong" else random.randint(120, 600)
            _records.append({
                "ts": now - (28 - i) * 21 - random.random() * 8,
                "user": random.choice(users), "plan": "pro", "tier": tier,
                "model": model["id"], "in": in_tok, "out": out_tok,
                "cost": price(model, in_tok, out_tok), "ms": ms, "status": "ok",
            })
