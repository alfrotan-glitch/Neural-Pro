# Monitoring & SLOs

**Status:** target. There is no monitoring today beyond `/api/health`.

---

## 1. Signals

| Signal | Source | Purpose |
|---|---|---|
| `GET /api/health` | server | liveness/startup probe |
| `GET /api/health/ai` | server | AI configured? which operations available? |
| Request rate, latency p50/p95/p99, status mix | log-derived | capacity + regressions |
| AI call count, latency, error code mix, token totals | log-derived | **cost protection** |
| Rate-limit trigger count | log-derived | abuse detection |
| Workflow run outcomes (client) | console/telemetry | export/podcast/TTS success rate |
| Client error boundary triggers | console/telemetry | white-screen detection |

## 2. Alerts (target)

| Alert | Condition | Severity |
|---|---|---|
| `ai_cost_spike` | token spend per hour > 3× the trailing 24 h median | P1 |
| `ai_error_rate` | `ai.failure` / total > 10 % over 15 min | P2 |
| `ai_not_configured` | any request served while `GEMINI_API_KEY` is absent | P2 |
| `server_5xx` | 5xx rate > 2 % over 10 min | P1 |
| `rate_limit_abuse` | > 100 rate-limit triggers from distinct IPs in 10 min | P2 |
| `health_probe_fail` | 3 consecutive failed probes | P1 |
| `unknown_operation` | any request to a removed route (`/api/export/*`, `/api/generateContent`) | P3 (migration signal) |

## 3. SLOs (target, for the hosted service)

| SLO | Target |
|---|---|
| `/api/health` availability | 99.5 % monthly |
| Non-AI API latency | p95 < 300 ms |
| AI operation success (excludes upstream) | ≥ 99 % |
| Median script generation | < 30 s |
| Median TTS per 10-line chunk | < 20 s |

Export is **client-side** and therefore has no server SLO; its success rate is a product
metric collected from workflow events (only with consent, and only as counts).

## 4. Dashboards (target)

1. **Service:** request rate, status mix, latency, instance count, memory.
2. **AI:** calls/min by operation, error codes, token totals, budget consumption.
3. **Abuse:** rate-limit triggers, distinct IPs, requests to removed routes.
4. **Client (opt-in aggregates):** workflow outcome counts, error-boundary triggers, browser
   capability failures.

## 5. What is explicitly NOT monitored

User project contents, prompt text, media, filenames. Client telemetry, if ever added, is
counts and error codes only, behind explicit consent, and declared in a privacy note.

## 6. Current gaps

| Gap | Severity |
|---|---|
| No alerting at all | P2 |
| No cost visibility on AI usage | **P1** (pairs with the P0 passthrough) |
| `/api/health` does not report AI configuration or capabilities | P2 |
| No client-side error reporting, so white screens (D-013) are invisible | P2 |
