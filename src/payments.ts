import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { PrivateKey } from '@hiero-ledger/sdk';
import { createClientHederaSigner } from '@x402/hedera';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import type { PaymentRequirements, PaymentPayload } from '@x402/core/types';
import type { Provider } from './domain.js';
import { isTestnet } from './hedera.js';
import { Store, digest } from './store.js';

const demoSecret = randomUUID();
const facilitator = () => process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator';
export async function fetchJson(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`Upstream returned HTTP ${r.status}`);
  return r.json();
}
export async function requirements(provider: Provider): Promise<PaymentRequirements> {
  if (!isTestnet()) return { scheme: 'exact', network: 'demo:local', asset: 'demo-USDC', amount: String(provider.priceMicros), payTo: 'demo-merchant', maxTimeoutSeconds: 180, extra: { feePayer: 'demo-facilitator' } };
  if (!process.env.HEDERA_MERCHANT_ID) throw new Error('HEDERA_MERCHANT_ID is missing');
  const capabilities = await fetchJson(facilitator() + '/supported');
  const supported = capabilities.kinds?.find((k: any) => k.scheme === 'exact' && k.network === 'hedera:testnet' && k.x402Version === 2);
  if (!supported?.extra?.feePayer) throw new Error('Facilitator does not advertise Hedera testnet fee sponsorship');
  return { scheme: 'exact', network: 'hedera:testnet', asset: process.env.HEDERA_USDC_TOKEN_ID || '0.0.429274', amount: String(provider.priceMicros), payTo: process.env.HEDERA_MERCHANT_ID, maxTimeoutSeconds: 180, extra: { feePayer: supported.extra.feePayer } };
}
export async function signPayment(accepted: PaymentRequirements, url: string): Promise<PaymentPayload> {
  if (!isTestnet()) {
    const nonce = randomUUID(); const issued = Date.now();
    const signature = createHmac('sha256', demoSecret).update(JSON.stringify({ accepted, nonce, issued })).digest('hex');
    return { x402Version: 2, resource: { url, description: 'Synthetic industrial forecast', mimeType: 'application/json' }, accepted, payload: { nonce, issued, signature } };
  }
  // Validate all quote fields before signing, even though the client only calls allowlisted local merchants.
  if (accepted.network !== 'hedera:testnet' || accepted.payTo !== process.env.HEDERA_MERCHANT_ID || accepted.asset !== (process.env.HEDERA_USDC_TOKEN_ID || '0.0.429274')) throw new Error('Untrusted payment quote');
  if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) throw new Error('Testnet payer credentials are missing');
  const signer = createClientHederaSigner(process.env.HEDERA_ACCOUNT_ID, PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY), { network: 'hedera:testnet' });
  const payload = await new ExactHederaScheme(signer).createPaymentPayload(2, accepted);
  return { ...payload, accepted, resource: { url, description: 'Synthetic industrial forecast', mimeType: 'application/json' } } as PaymentPayload;
}
export async function settlePayment(store: Store, payload: PaymentPayload, expected: PaymentRequirements) {
  if (payload.x402Version !== 2 || digest(payload.accepted) !== digest(expected)) throw new Error('Payment does not match the current quote');
  const paymentId = digest(payload.payload);
  // Write intent before a side effect. Uncertain results stay pending and cannot be replayed.
  if (store.getReceipt(paymentId)) throw new Error('Payment already submitted; reuse the original response or reconcile the pending receipt');
  if (!isTestnet()) {
    const {nonce, issued, signature} = payload.payload as any;
    if (typeof nonce !== 'string' || typeof issued !== 'number' || typeof signature !== 'string' || Date.now() - issued > 180000 || issued > Date.now() + 1000) throw new Error('Invalid demo authorization');
    const expectedSig = createHmac('sha256', demoSecret).update(JSON.stringify({ accepted: expected, nonce, issued })).digest('hex');
    if (signature.length !== expectedSig.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) throw new Error('Invalid demo signature');
    const receipt = { success: true, network: 'demo:local', transactionId: null, demoReceiptId: 'demo-' + nonce, payer: 'demo-agent', simulated: true };
    store.setReceipt(paymentId, receipt); return receipt;
  }
  const body = JSON.stringify({ x402Version: 2, paymentPayload: payload, paymentRequirements: expected });
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body };
  const verification = await fetchJson(facilitator() + '/verify', init);
  if (!verification.isValid) throw new Error('Facilitator rejected payment');
  store.setReceipt(paymentId, { pending: true, time: new Date().toISOString() });
  const receipt = await fetchJson(facilitator() + '/settle', init);
  if (!receipt.success || receipt.network !== 'hedera:testnet' || !(receipt.transactionId || receipt.transaction)) throw new Error('Settlement not confirmed; reservation retained for reconciliation');
  const result = { ...receipt, transactionId: receipt.transactionId || receipt.transaction, simulated: false };
  store.setReceipt(paymentId, result); return result;
}
