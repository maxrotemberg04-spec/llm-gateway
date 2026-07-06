"""Gateway configuration — models, prices, limits. Mirrors my production app's locked backend.

⚠️ Prices are placeholders — set the real per-1M-token prices before trusting the
cost numbers.
"""

# Model routing tiers: id + price per 1M tokens (input / output), USD.
MODELS = {
    "cheap":  {"id": "claude-haiku-4-5-20251001", "in": 1.00, "out": 5.00},
    "strong": {"id": "claude-sonnet-5",           "in": 3.00, "out": 15.00},
}
DEFAULT_TIER = "strong"

# Per-plan rate limits: how many requests per rolling window.
LIMITS = {
    "free": {"limit": 5,  "window_seconds": 7 * 24 * 3600},   # 5 / week
    "pro":  {"limit": 30, "window_seconds": 24 * 3600},        # 30 / day
}

# Global kill-switch: block all traffic once monthly spend passes this (USD).
MONTHLY_SPEND_CAP_USD = 50.00
