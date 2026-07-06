"""Global kill-switch state: stop all traffic past a monthly spend cap."""
from .config import MONTHLY_SPEND_CAP_USD

_state = {"enabled": True, "cap_usd": MONTHLY_SPEND_CAP_USD}


def get() -> dict:
    return dict(_state)


def set_state(enabled=None, cap_usd=None) -> dict:
    if enabled is not None:
        _state["enabled"] = bool(enabled)
    if cap_usd is not None:
        _state["cap_usd"] = float(cap_usd)
    return dict(_state)


def tripped(total_spend: float) -> bool:
    return _state["enabled"] and total_spend >= _state["cap_usd"]
