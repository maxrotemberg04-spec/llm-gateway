"""Token → cost tracking. In-memory for the scaffold; SQLite + dashboard come next."""
from collections import defaultdict

_total_usd = 0.0
_by_user = defaultdict(float)
_requests = 0


def record(user_id: str, model: dict, in_tok: int, out_tok: int) -> float:
    """Add one request's cost; return the cost of this request (USD)."""
    global _total_usd, _requests
    usd = (in_tok * model["in"] + out_tok * model["out"]) / 1_000_000
    _total_usd += usd
    _by_user[user_id] += usd
    _requests += 1
    return usd


def summary() -> dict:
    return {
        "total_requests": _requests,
        "total_cost_usd": round(_total_usd, 6),
        "by_user": {u: round(c, 6) for u, c in _by_user.items()},
    }
