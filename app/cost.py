"""Pricing math: turn token counts into dollars."""


def price(model: dict, in_tok: int, out_tok: int) -> float:
    """USD cost of one call, from per-1M-token prices in config."""
    return (in_tok * model["in"] + out_tok * model["out"]) / 1_000_000
