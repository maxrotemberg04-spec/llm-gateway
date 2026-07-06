"""LLM Gateway — a proxy in front of the LLM API.

v0 scaffold: `/chat` works (mock mode, or real Claude with a key), routes a model
tier, and tracks cost. Rate limiting, kill-switch, fallback, and the dashboard
land next (see README roadmap).
"""
from fastapi import FastAPI
from pydantic import BaseModel

from .config import MODELS, DEFAULT_TIER
from .providers import call_model, _has_key
from . import cost

app = FastAPI(title="LLM Gateway")


class ChatRequest(BaseModel):
    prompt: str
    user_id: str = "demo"
    tier: str = DEFAULT_TIER          # "cheap" | "strong"
    system: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "mode": "live" if _has_key() else "mock"}


@app.post("/chat")
def chat(req: ChatRequest):
    # TODO(next): rate-limit this user; block if the kill-switch cap is hit.
    model = MODELS.get(req.tier, MODELS[DEFAULT_TIER])
    reply, in_tok, out_tok = call_model(model["id"], req.prompt, req.system)
    spend = cost.record(req.user_id, model, in_tok, out_tok)
    return {
        "reply": reply,
        "model": model["id"],
        "tokens": {"in": in_tok, "out": out_tok},
        "cost_usd": round(spend, 6),
    }


@app.get("/stats")
def stats():
    return cost.summary()
