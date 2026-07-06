"""LLM providers: a keyless mock (for demos/tests) + real Claude, with fallback."""
import os

from .config import MODELS


def _has_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def call_model(model_id: str, prompt: str, system: str | None = None):
    """Return (reply_text, input_tokens, output_tokens)."""
    if not _has_key():
        reply = f"[mock:{model_id}] {prompt[:80]}"     # keyless mock
        return reply, len(prompt.split()), len(reply.split())

    import anthropic
    client = anthropic.Anthropic()
    kwargs = dict(model=model_id, max_tokens=1024,
                  messages=[{"role": "user", "content": prompt}])
    if system:
        kwargs["system"] = system
    msg = client.messages.create(**kwargs)
    return msg.content[0].text, msg.usage.input_tokens, msg.usage.output_tokens


def call_with_fallback(tier: str, prompt: str, system: str | None = None):
    """Try the requested tier; if it errors, fall back to the others.
    Returns (tier_used, reply, in_tok, out_tok)."""
    order = [tier] + [t for t in MODELS if t != tier]
    last_error = None
    for t in order:
        try:
            reply, in_tok, out_tok = call_model(MODELS[t]["id"], prompt, system)
            return t, reply, in_tok, out_tok
        except Exception as e:
            last_error = e
    raise RuntimeError(f"all providers failed: {last_error}")
