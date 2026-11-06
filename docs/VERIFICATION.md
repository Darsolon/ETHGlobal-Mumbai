# Independent testnet evidence verification

The verifier is read-only. It does not create accounts, submit payments, release reservations, write HCS messages, or automatically mark the submission evidence file as verified. Test fixtures are not live blockchain proof.

## Verify one payment

After a real x402 request returns a settlement receipt, use its transaction ID and the known payer, merchant, token and atomic amount:

```sh
npm run verify:evidence -- payment TRANSACTION_ID PAYER_ID MERCHANT_ID 0.0.429274 12000
```

Replace the uppercase placeholders. USDC has six decimals, so 12000 atomic units is 0.012 USDC. Both `0.0.ACCOUNT@SECONDS.NANOSECONDS` SDK IDs and fully padded `0.0.ACCOUNT-SECONDS-NANOSECONDS` Mirror Node IDs are accepted.

The command queries the **testnet** Mirror Node and requires a successful parent transaction with the expected transaction ID. It checks exact token debits/credits for the distinct payer and merchant, the token ID and amount, and a balanced transfer list. Failed or duplicate entries are not proof; child transactions cannot substitute for the signed parent. Unsafe floating-point amounts fail closed. HTTP 404 may mean indexing has not caught up; it never becomes success.

Only after this check succeeds should the actual transaction ID, HashScan URL and payer/merchant be recorded in `docs/evidence.json` and README. Do not reuse example IDs or convert a `demo-...` receipt into a transaction ID.

## Verify HCS commitments

With the journal containing successful HCS anchors:

```sh
npm run verify:evidence -- hcs
```

The command reads each anchored event's topic and sequence from `data/state.json`, queries the specific Mirror Node message, validates the local event hash, and compares the published app/version, event ID, type, run ID, hash and previous hash. Consensus timestamp and sequence must be present and match. Local-only events do not count as HCS evidence. This verifies the selected anchors, not that every event was anchored; inspect audit coverage separately.

Official endpoint references: [Mirror Node transactions](https://docs.hedera.com/reference/rest-api/transactions), [HCS topic messages](https://docs.hedera.com/reference/rest-api/topics).

## Ambiguous payment recovery

Before settlement, the service writes a persistent claim keyed by the payment payload. Concurrent requests can verify concurrently, but only one crosses the settlement boundary. Successful facilitator receipts must identify the transfer that was actually signed. A timeout, rejection after submission, wrong network or wrong transaction leaves the claim pending and retains the spending reservation. Retrying the same run or payload does not pay again.

For a pending payment, inspect its stored transaction ID and use Mirror Node to determine what happened. Record the reconciliation decision in the audit trail. Do not clear the journal, change the idempotency key to force a retry, or release a reservation merely because the HTTP response was lost. This prototype deliberately has no automatic release/refund endpoint.

HCS anchoring is independent: a successful payment with a failed anchor remains a successful payment in the local journal. The anchor failure is explicit, and no consensus proof is invented.
