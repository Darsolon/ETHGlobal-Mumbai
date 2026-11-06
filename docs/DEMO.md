# Demo walkthrough (target: 3–4 minutes)

The recording must be explicit about mode. A local simulated walkthrough is a product demo, not proof of track qualification. Record the actual testnet flow once funded credentials are ready.

1. **0:00–0:25 — Problem.** Introduce GridAgent: factories have flexible loads and volatile hourly energy prices. An agent should spend only on data that can help the schedule.
2. **0:25–0:55 — Constraints and policy.** Show the compressor, cooling and charging blocks, operating windows, 400 kW connection cap, daily/per-provider budgets and autonomous threshold.
3. **0:55–1:30 — The market.** Show two price providers. Explain why the lower price wins, why carbon can affect the objective, and why weather is deliberately skipped in this model.
4. **1:30–2:20 — Pay and plan.** Click Plan next shift. Show HTTP 402, signed retry, successful facilitator receipt, and the **actual** HashScan transaction in testnet. Do not expose private keys or operator token. If this is local mode, say “simulated” and do not imply on-chain settlement.
5. **2:20–2:55 — Outcome.** Show the price curve, current vs optimized Gantt schedules, conserved energy, satisfied capacity and modeled cost/carbon change. State inputs are synthetic and no machinery is actuated.
6. **2:55–3:30 — Verify.** Open the audit trail, show payment and schedule hashes; in testnet show HCS topic/sequence and corresponding Mirror Node message.
7. **3:30–3:50 — Close.** Show public repo/deployment, architecture and next steps. Explain what Hedera contributes: HTS settlement and HCS audit commitments, with SDKs and no Solidity.

Keep final video below five minutes. Ensure the public link plays without requesting access. Include that link and verified transaction in README and docs/evidence.json before actual submission.
