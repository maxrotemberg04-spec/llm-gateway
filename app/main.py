"""LLM Gateway — a proxy in front of the LLM API, with a live dashboard.

Pipeline per request:  kill-switch -> rate-limit -> route model -> call (w/ fallback)
-> record cost + latency. The dashboard reads the metrics endpoints.
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import MODELS, DEFAULT_TIER
from .providers import call_with_fallback, _has_key
from .ratelimit import limiter
from . import metrics, state

STATIC = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    metrics.seed_demo()                 # dashboard opens with live-looking mock data
    for user, n in [("maria", 22), ("devon", 14), ("priya", 8), ("sam", 5)]:
        for _ in range(n):
            limiter.check(user, "pro")  # seed the rate-limit panel
    yield


app = FastAPI(title="LLM Gateway", lifespan=lifespan)


class ChatRequest(BaseModel):
    prompt: str
    user_id: str = "demo"
    plan: str = "free"                 # "free" | "pro" -> rate limit
    tier: str = DEFAULT_TIER           # "cheap" | "strong" -> model
    system: str | None = None


class KillswitchUpdate(BaseModel):
    enabled: bool | None = None
    cap_usd: float | None = None


@app.get("/health")
def health():
    return {"ok": True, "mode": "live" if _has_key() else "mock"}


@app.post("/chat")
def chat(req: ChatRequest):
    tier = req.tier if req.tier in MODELS else DEFAULT_TIER

    # 1. kill-switch: stop everything if the monthly spend cap is reached.
    if state.tripped(metrics.total_spend()):
        metrics.record(req.user_id, req.plan, tier, MODELS[tier], 0, 0, 0, "killswitch")
        return {"status": "blocked", "error": "kill-switch active: spend cap reached"}

    # 2. rate limit this user.
    rl = limiter.check(req.user_id, req.plan)
    if not rl["allowed"]:
        metrics.record(req.user_id, req.plan, tier, MODELS[tier], 0, 0, 0, "rate_limited")
        return {"status": "rate_limited", "error": "rate limit exceeded", "rate_limit": rl}

    # 3. route + call (with fallback on error) + record cost and latency.
    used_tier, reply, in_tok, out_tok, ms = call_with_fallback(tier, req.prompt, req.system)
    model = MODELS[used_tier]
    usd = metrics.record(req.user_id, req.plan, used_tier, model, in_tok, out_tok, ms, "ok")
    return {
        "status": "ok",
        "reply": reply,
        "model": model["id"],
        "tier": used_tier,
        "tokens": {"in": in_tok, "out": out_tok},
        "latency_ms": int(ms),
        "cost_usd": round(usd, 6),
        "rate_limit": rl,
    }


@app.get("/stats")
def stats():
    return metrics.summary()


@app.get("/stats/timeseries")
def stats_timeseries():
    return metrics.timeseries()


@app.get("/stats/recent")
def stats_recent():
    return metrics.recent()


@app.get("/limits")
def limits():
    return limiter.snapshot()


@app.get("/killswitch")
def killswitch():
    return {**state.get(), "total_spend_usd": round(metrics.total_spend(), 6)}


@app.post("/killswitch")
def killswitch_set(update: KillswitchUpdate):
    return state.set_state(update.enabled, update.cap_usd)


# --- serve the dashboard ---
app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")


@app.get("/")
def dashboard():
    return FileResponse(str(STATIC / "index.html"))
