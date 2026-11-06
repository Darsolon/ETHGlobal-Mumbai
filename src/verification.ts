import type { AuditEvent } from './store.js';
import { digest } from './store.js';

const mirror = 'https://testnet.mirrornode.hedera.com';
const entity = /^0\.0\.\d+$/;
export function mirrorTransactionId(id: string): string {
  if (typeof id !== 'string') throw new Error('Invalid Hedera transaction ID');
  const match = /^(0\.0\.\d+)@(\d+)\.(\d{1,9})$/.exec(id) || /^(0\.0\.\d+)-(\d+)-(\d{9})$/.exec(id);
  if (!match) throw new Error('Invalid Hedera transaction ID');
  return `${match[1]}-${match[2]}-${match[3].padEnd(9,'0')}`;
}
type JsonReader = (url: string) => Promise<unknown>;
function atomicAmount(value: unknown): bigint {
  if(typeof value==='number'&&Number.isSafeInteger(value)) return BigInt(value);
  if(typeof value==='string'&&/^-?\d+$/.test(value)) return BigInt(value);
  throw new Error('Mirror Node amount is not an exact integer');
}
const readJson: JsonReader = async url => {
  const response = await fetch(url, {signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`Mirror Node returned HTTP ${response.status}; indexing may still be pending`);
  return response.json();
};
export type PaymentExpectation = { transactionId: string; payer: string; merchant: string; tokenId: string; amount: string };
export async function verifyPaymentOnMirror(expected: PaymentExpectation, read: JsonReader = readJson) {
  for (const value of [expected.payer, expected.merchant, expected.tokenId]) if (!entity.test(value)) throw new Error('Invalid expected account or token ID');
  if (expected.payer === expected.merchant || !/^[1-9]\d*$/.test(expected.amount)) throw new Error('Expected distinct payer/merchant and a positive integer amount');
  const transactionId = mirrorTransactionId(expected.transactionId);
  const data = await read(`${mirror}/api/v1/transactions/${encodeURIComponent(transactionId)}`) as any;
  const transaction = data.transactions?.find((t:any) => {
    if (t.result !== 'SUCCESS' || t.transaction_id !== transactionId || (t.nonce ?? 0) !== 0) return false;
    const transfers = t.token_transfers?.filter((x:any) => x.token_id === expected.tokenId && !x.is_approval);
    if (!Array.isArray(transfers)) return false;
    const net = (account:string) => transfers.filter((x:any)=>x.account===account).reduce((sum:bigint,x:any)=>sum+atomicAmount(x.amount),0n);
    return net(expected.payer) === -BigInt(expected.amount) && net(expected.merchant) === BigInt(expected.amount)
      && transfers.reduce((sum:bigint,x:any)=>sum+atomicAmount(x.amount),0n) === 0n;
  });
  if (!transaction) throw new Error('Mirror Node does not confirm the expected successful HTS transfer');
  return { verified:true, network:'hedera:testnet', transactionId, consensusTimestamp:transaction.consensus_timestamp,
    hashscanUrl:`https://hashscan.io/testnet/transaction/${encodeURIComponent(expected.transactionId)}`, expected };
}
export async function verifyHcsOnMirror(event: AuditEvent, read: JsonReader = readJson) {
  if (!event.hcs || !entity.test(event.hcs.topicId) || !/^[1-9]\d*$/.test(event.hcs.sequence)) throw new Error('Event has no valid HCS anchor');
  const {hash,hcs,hcsError,...body}=event;
  if(digest(body)!==hash) throw new Error('Local event hash is invalid');
  const data=await read(`${mirror}/api/v1/topics/${encodeURIComponent(hcs.topicId)}/messages/${encodeURIComponent(hcs.sequence)}`) as any;
  if(String(data.sequence_number)!==hcs.sequence||!data.consensus_timestamp||typeof data.message!=='string') throw new Error('Mirror Node message metadata does not match anchor');
  const message=JSON.parse(Buffer.from(data.message,'base64').toString('utf8'));
  if(message.app!=='GridAgent'||message.version!==1||message.eventId!==event.id||message.type!==event.type||message.runId!==event.runId||message.hash!==hash||message.previousHash!==event.previousHash) throw new Error('HCS commitment does not match the local event');
  return {verified:true,topicId:hcs.topicId,sequence:hcs.sequence,consensusTimestamp:data.consensus_timestamp,eventId:event.id,hash};
}
