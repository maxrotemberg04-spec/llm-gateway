"""LLM providers: a keyless mock (for demos/tests) + real Claude."""
import os


def _has_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def call_model(model_id: str, prompt: str, system: str | None = None):
    """Return (reply_text, input_tokens, output_tokens)."""
    if not _has_key():
        # Mock mode — no API key needed, so the gateway always runs + demos.
        reply = f"[mock:{model_id}] {prompt[:80]}"
        return reply, len(prompt.split()), len(reply.split())

    import anthropic
    client = anthropic.Anthropic()
    kwargs = dict(model=model_id, max_tokens=1024,
                  messages=[{"role": "user", "content": prompt}])
    if system:
        kwargs["system"] = system
    msg = client.messages.create(**kwargs)
    return msg.content[0].text, msg.usage.input_tokens, msg.usage.output_tokens
