# GridAgent submission draft

Submission status is recorded in evidence.json. The public demo and video are available; live Hedera payment/HCS proof remains unverified. A submitted form alone does not establish prize eligibility.

**Project name:** GridAgent

**Tagline:** A factory energy agent that buys better decisions, one data call at a time.

**Short description:** GridAgent compares energy data providers, pays for useful information through x402 on Hedera, and shifts flexible factory loads into lower-cost operating hours. Spending controls apply before every payment, while hash-linked decisions can be committed to an HCS topic.

**Problem:** Industrial electricity prices vary by hour. A factory can shift some demand without shifting its production goals. But an autonomous planner needs both useful data and a controlled way to buy it.

**How it works:** The operator sets load windows, energy requirements, site capacity, a carbon objective and data spending limits. GridAgent discovers a small provider market, compares quotes, and selects the cheapest eligible useful source in each category. The data service answers with HTTP 402, the client signs a Hedera payment, and a facilitator verifies and settles the transfer before releasing data. GridAgent searches continuous load schedules under the factory constraints and records the payment receipts and scheduling commitments.

**Why Hedera:** HTS enables low-value testnet USDC transfers; facilitator fee sponsorship keeps payment gas off the agent; HCS publishes consensus-timestamped commitments to spending and decisions. The prototype uses SDKs and no Solidity.

**What is built:** An interactive operations dashboard, provider discovery, x402 client/resource server, server-enforced budgets and thresholds, replay/idempotency protection, exact block scheduler, local hash-linked log and HCS integration. An optional eve model-backed agent has typed tools into the same governed service.

**Demo scope:** Synthetic DE-LU electricity/carbon/weather data. The default local demo buys two feeds for 0.018 simulated USDC and produces €122.14 modeled wholesale-energy savings. This is an illustrative scenario, not a measured factory result. The demo receipts are explicitly simulated; only independently verified transaction IDs count as testnet evidence.

**Challenges:** Keeping budget reservations safe across ambiguous payment outcomes; separating modeled savings from data costs in a different currency; preventing redundant data purchases; enforcing global factory capacity across overlapping operating windows; reporting anchoring failure without obscuring successful payment settlement.

**Next:** Real day-ahead data feeds, thermal/SOC dynamics, calendar-aware slots, stronger provider value estimation, distributed storage and safe operator-reviewed dispatch integration.

**Target prize:** Hedera — AI Agents That Pay: x402 on Hedera. Consider “No Solidity Allowed” only after HTS and HCS are both demonstrated live. Do not submit to ATS/Stablecoin Studio or Continuity tracks because this project does not meet those requirements.

## Submission checklist

- [x] Working local product and automated tests
- [x] Public original repository, complete source pushed directly to `main`
- [x] Setup, architecture and payment-flow README
- [ ] At least one verified real settled Hedera x402 payment
- [ ] Actual transaction ID in README and evidence.json, with working HashScan link
- [ ] Verified HCS topic/sequence and spending commitment
- [x] Public browser simulation: https://gridagent-mumbai-demo.vercel.app
- [x] Narrated 2:21, 720p product walkthrough uploaded and saved to ETHGlobal (simulation disclosed)
- [ ] Separate video evidence of actual settlement
- [x] Authenticated ETHGlobal draft populated with repository, media, descriptions and Hedera questionnaire
- [ ] Resolve team eligibility warning or explicitly approve removal of affected member
- [ ] Submit and verify confirmation URL

No submission or stake return is guaranteed by preparing these materials. ETHGlobal eligibility, presentation and judging requirements apply.
