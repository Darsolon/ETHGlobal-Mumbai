import { Client, PrivateKey, TopicCreateTransaction, TopicMessageSubmitTransaction } from '@hiero-ledger/sdk';
import type { AuditEvent, Store } from './store.js';

export const isTestnet = () => process.env.GRID_MODE === 'testnet';
export function hederaClient() {
  if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) throw new Error('Hedera account credentials are missing');
  return Client.forTestnet().setOperator(process.env.HEDERA_ACCOUNT_ID, PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY));
}
export async function anchorEvent(store: Store, event: AuditEvent) {
  if (!isTestnet()) return;
  const topicId = process.env.HEDERA_TOPIC_ID;
  if (!topicId) { store.anchor(event.id, undefined, 'HEDERA_TOPIC_ID is missing; event is local only'); return; }
  const client = hederaClient();
  try {
    // Commit the complete local event by hash, keeping each HCS message below 1024 bytes.
    const message = JSON.stringify({ app: 'GridAgent', version: 1, eventId: event.id, type: event.type, runId: event.runId, hash: event.hash, previousHash: event.previousHash });
    const tx = await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(message).execute(client);
    const receipt = await tx.getReceipt(client);
    store.anchor(event.id, { topicId, sequence: receipt.topicSequenceNumber!.toString(), transactionId: tx.transactionId.toString() });
  } catch { store.anchor(event.id, undefined, 'HCS anchoring failed; local hash retained for retry'); }
  finally { client.close(); }
}
export async function createTopic() {
  const client = hederaClient();
  try {
    const key = PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY!);
    const tx = await new TopicCreateTransaction().setTopicMemo('GridAgent decision and payment commitments').setSubmitKey(key.publicKey).execute(client);
    const receipt = await tx.getReceipt(client); return receipt.topicId!.toString();
  } finally { client.close(); }
}
