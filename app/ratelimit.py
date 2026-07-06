"""Per-user rate limiting: a request counter with a rolling time window.

This is the Redis counter+TTL pattern (from the redis-clone), in memory.
"""
import threading
import time

from .config import LIMITS


class RateLimiter:
    def __init__(self):
        self._hits = {}          # (user, plan) -> [window_start, count]
        self._lock = threading.Lock()

    def check(self, user: str, plan: str) -> dict:
        cfg = LIMITS.get(plan, LIMITS["free"])
        now = time.time()
        with self._lock:
            key = (user, plan)
            start, count = self._hits.get(key, [now, 0])
            if now - start >= cfg["window_seconds"]:   # window expired -> reset
                start, count = now, 0
            allowed = count < cfg["limit"]
            if allowed:
                count += 1
            self._hits[key] = [start, count]
            return {
                "allowed": allowed,
                "used": count,
                "limit": cfg["limit"],
                "remaining": max(0, cfg["limit"] - count),
                "reset_in_seconds": int(cfg["window_seconds"] - (now - start)),
            }

    def snapshot(self) -> list:
        now = time.time()
        rows = []
        with self._lock:
            for (user, plan), (start, count) in self._hits.items():
                cfg = LIMITS.get(plan, LIMITS["free"])
                used = 0 if now - start >= cfg["window_seconds"] else count
                rows.append({"user": user, "plan": plan, "used": used,
                             "limit": cfg["limit"], "remaining": max(0, cfg["limit"] - used)})
        return sorted(rows, key=lambda r: r["used"], reverse=True)


limiter = RateLimiter()
