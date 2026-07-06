# llm-gateway

A **gateway that sits in front of the LLM API** — the layer that makes AI apps affordable and safe to run at scale. One endpoint that rate-limits users, routes to the right model, tracks token cost, falls back on errors, and kills traffic if spend runs away — with a dashboard to watch it.

Portfolio project #3 — **AI infrastructure.** It's a standalone build of **[my production app](https://github.com/maxrotemberg04-spec)'s** Supabase AI proxy ("Mission Control"): the logic here lifts straight into my production app's edge functions.

## Why a gateway?
Call the LLM API directly from your app and you get: no cost visibility, no rate limits, no fallback, and your key exposed. A gateway fixes all of that in one place.

## Features
- **Proxy** — one `POST /chat` your app calls instead of the LLM directly  *(live)*
- **Model routing** — cheap (Haiku) vs strong (Sonnet) per request  *(live)*
- **Cost tracking** — tokens × price, per request and per user  *(live)*
- **Mock mode** — runs with no API key, so it always demos  *(live)*
- **Rate limiting** — per-user request caps (counter + TTL)  *(next)*
- **Kill-switch** — stop all traffic past a monthly spend cap  *(next)*
- **Fallback** — retry another model when one errors  *(next)*
- **Dashboard** — a premium UI for usage, cost, and limits  *(next)*

## Run it (no key needed)
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
# in another terminal:
curl -s localhost:8000/chat -H 'content-type: application/json' \
     -d '{"prompt":"give me a tempo run","tier":"strong"}'
curl -s localhost:8000/stats
```
Set `ANTHROPIC_API_KEY` to proxy **real** Claude instead of the mock.

## Architecture
```
your app ──POST /chat──►  gateway  ──►  LLM API
                          ├─ route model (cheap / strong)
                          ├─ rate-limit per user      (next)
                          ├─ track token cost
                          ├─ kill-switch on overspend  (next)
                          └─ log usage → /stats → dashboard (next)
```

## Roadmap
- [x] FastAPI proxy: `/chat`, `/stats`, `/health`; mock + real providers
- [x] Model routing + per-request / per-user cost tracking
- [ ] Rate limiting (counter + TTL — the Redis pattern)
- [ ] Global kill-switch (monthly spend cap)
- [ ] Fallback routing on model error
- [ ] Premium dashboard UI (usage · cost · limits)

## How it maps to my production app
my production app's backend runs an AI proxy in Supabase edge functions with rate limits (tiered), Sonnet/Haiku routing, cost tracking, and a global kill-switch. This repo builds that system standalone — same design, portable logic.
