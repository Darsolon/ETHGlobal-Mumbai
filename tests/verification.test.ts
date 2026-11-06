import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digest, type AuditEvent } from '../src/store.js';
import { mirrorTransactionId, verifyHcsOnMirror, verifyPaymentOnMirror } from '../src/verification.js';

const expected={transactionId:'0.0.3333@1700000000.000000001',payer:'0.0.1111',merchant:'0.0.2222',tokenId:'0.0.429274',amount:'12000'};
const row={result:'SUCCESS',transaction_id:'0.0.3333-1700000000-000000001',nonce:0,consensus_timestamp:'1700000001.000000002',token_transfers:[
  {token_id:'0.0.429274',account:'0.0.1111',amount:-12000},
  {token_id:'0.0.429274',account:'0.0.2222',amount:12000},
]};
test('Mirror verification checks successful exact token net transfers, ignoring duplicates',async()=>{
  let requested='';
  const result=await verifyPaymentOnMirror(expected,async url=>{requested=url;return {transactions:[{...row,result:'DUPLICATE_TRANSACTION'},row]};});
  assert.equal(result.verified,true);assert.ok(requested.endsWith('/api/v1/transactions/0.0.3333-1700000000-000000001'));
  assert.equal(mirrorTransactionId(row.transaction_id),row.transaction_id);
  assert.throws(()=>mirrorTransactionId('https://attacker.invalid'),/Invalid/);
});
test('wrong token, wrong amount, failed consensus and a child transaction cannot pass evidence checks',async()=>{
  for(const invalid of [
    {...row,result:'INSUFFICIENT_ACCOUNT_BALANCE'},
    {...row,nonce:1},
    {...row,token_transfers:row.token_transfers.map(t=>({...t,token_id:'0.0.9999'}))},
    {...row,token_transfers:row.token_transfers.map(t=>({...t,amount:t.amount/2}))},
  ]) await assert.rejects(()=>verifyPaymentOnMirror(expected,async()=>({transactions:[invalid]})),/does not confirm/);
  await assert.rejects(()=>verifyPaymentOnMirror({...expected,payer:expected.merchant},async()=>({transactions:[row]})),/distinct/);
});
function eventFixture():AuditEvent {
  const body={id:'event-1',time:'2026-11-06T15:00:00Z',type:'payment.settled',runId:'run-1',detail:{amountMicros:12000},previousHash:'0'.repeat(64)};
  return {...body,hash:digest(body),hcs:{topicId:'0.0.1234',sequence:'7',transactionId:expected.transactionId}};
}
test('HCS verification matches the full published commitment to the local event hash',async()=>{
  const event=eventFixture();const {id:eventId,type,runId,hash,previousHash}=event;
  const commitment={app:'GridAgent',version:1,eventId,type,runId,hash,previousHash};
  const data={sequence_number:7,consensus_timestamp:'1700000001.000000002',message:Buffer.from(JSON.stringify(commitment)).toString('base64')};
  assert.equal((await verifyHcsOnMirror(event,async()=>data)).verified,true);
  await assert.rejects(()=>verifyHcsOnMirror({...event,detail:{amountMicros:1}},async()=>data),/Local event hash/);
  await assert.rejects(()=>verifyHcsOnMirror(event,async()=>({...data,message:Buffer.from(JSON.stringify({...commitment,hash:'f'.repeat(64)})).toString('base64')})),/does not match/);
  await assert.rejects(()=>verifyHcsOnMirror(event,async()=>({...data,sequence_number:8})),/metadata/);
  await assert.rejects(()=>verifyHcsOnMirror({...event,hcs:undefined},async()=>data),/no valid HCS/);
});
