"""LLM providers: a keyless mock (for demos/tests) + real Claude, with fallback.

Every call returns latency (ms) alongside the reply and token counts, so the
gateway can track p50/p95 like a real proxy. Real calls are measured; the mock
synthesizes a plausible latency (labeled mock data, no sleep).
"""
import os
import random
import time

from .config import MODELS


def _has_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def call_model(model_id: str, prompt: str, system: str | None = None):
    """Return (reply_text, input_tokens, output_tokens, latency_ms)."""
    if not _has_key():
        reply = f"[mock:{model_id}] {prompt[:80]}"
        ms = random.randint(120, 600) if "haiku" in model_id else random.randint(300, 1600)
        return reply, len(prompt.split()), len(reply.split()), ms

    import anthropic
    client = anthropic.Anthropic()
    kwargs = dict(model=model_id, max_tokens=1024,
                  messages=[{"role": "user", "content": prompt}])
    if system:
        kwargs["system"] = system
    t0 = time.perf_counter()
    msg = client.messages.create(**kwargs)
    ms = (time.perf_counter() - t0) * 1000
    return msg.content[0].text, msg.usage.input_tokens, msg.usage.output_tokens, ms


def call_with_fallback(tier: str, prompt: str, system: str | None = None):
    """Try the requested tier; if it errors, fall back to the others.
    Returns (tier_used, reply, in_tok, out_tok, ms)."""
    order = [tier] + [t for t in MODELS if t != tier]
    last_error = None
    for t in order:
        try:
            reply, in_tok, out_tok, ms = call_model(MODELS[t]["id"], prompt, system)
            return t, reply, in_tok, out_tok, ms
        except Exception as e:
            last_error = e
    raise RuntimeError(f"all providers failed: {last_error}")
