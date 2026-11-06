import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrivateKey, inspectHederaTransaction } from '@x402/hedera';
import { settlePayment, signPayment } from '../src/payments.js';
import { Store, digest } from '../src/store.js';
import { anchorEvent } from '../src/hedera.js';

process.env.GRID_MODE='testnet';
process.env.HEDERA_ACCOUNT_ID='0.0.1111';
process.env.HEDERA_MERCHANT_ID='0.0.2222';
process.env.HEDERA_USDC_TOKEN_ID='0.0.429274';
process.env.HEDERA_PRIVATE_KEY=PrivateKey.generateED25519().toStringDer();
const quote={scheme:'exact',network:'hedera:testnet' as const,asset:'0.0.429274',amount:'12000',payTo:'0.0.2222',maxTimeoutSeconds:180,extra:{feePayer:'0.0.3333'}};
const prepare=async()=>{
  const payload=await signPayment(quote,'http://localhost/api/data/gridpulse');
  const transactionId=inspectHederaTransaction(payload.payload.transaction as string).transactionId;
  return {payload,receipt:{success:true,network:'hedera:testnet',transactionId}};
};
test('concurrent replay can verify twice but submits only one settlement',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gridagent-settlement-'));
  try{
    const store=new Store(dir);const {payload,receipt}=await prepare();
    let verifies=0,settles=0;let release!:()=>void;
    const barrier=new Promise<void>(r=>release=r);
    const transport=async(url:string)=>{
      if(url.endsWith('/verify')){if(++verifies===2)release();await barrier;return {isValid:true};}
      settles++;await new Promise(r=>setTimeout(r,5));return receipt;
    };
    const results=await Promise.allSettled([settlePayment(store,payload,quote,transport),settlePayment(store,payload,quote,transport)]);
    assert.equal(settles,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.filter(r=>r.status==='rejected').length,1);
    assert.equal((store.getReceipt(digest(payload.payload)) as any).simulated,false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('uncertain settlement remains pending across restart and is never automatically retried',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gridagent-settlement-'));
  try{
    const store=new Store(dir);const reservation=store.reserve('gridpulse',12000,20000,20000);
    const {payload}=await prepare();let settlements=0;
    const transport=async(url:string)=>{if(url.endsWith('/verify'))return {isValid:true};settlements++;throw Error('Connection lost after submission');};
    await assert.rejects(()=>settlePayment(store,payload,quote,transport),/Connection lost/);
    const restarted=new Store(dir);assert.equal((restarted.getReceipt(digest(payload.payload)) as any).pending,true);
    assert.equal(restarted.totals().total,12000);
    await assert.rejects(()=>settlePayment(restarted,payload,quote,transport),/already submitted/);assert.equal(settlements,1);
    assert.ok(reservation);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('a facilitator receipt for a different transfer cannot become a successful receipt',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gridagent-settlement-'));
  try{
    const store=new Store(dir);const {payload,receipt}=await prepare();
    const transport=async(url:string)=>url.endsWith('/verify')?{isValid:true}:{...receipt,transactionId:'0.0.3333@1.000000000'};
    await assert.rejects(()=>settlePayment(store,payload,quote,transport),/does not match signed/);
    assert.equal((store.getReceipt(digest(payload.payload)) as any).pending,true);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('invalid authorization never reaches settlement',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gridagent-settlement-'));
  try{
    const store=new Store(dir);const {payload}=await prepare();let calls=0;
    await assert.rejects(()=>settlePayment(store,payload,quote,async()=>{calls++;return {isValid:false};}),/rejected/);
    assert.equal(calls,1);assert.equal(store.getReceipt(digest(payload.payload)),undefined);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('missing HCS credentials records an anchor failure instead of losing the payment journal',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gridagent-settlement-'));
  const oldKey=process.env.HEDERA_PRIVATE_KEY,oldTopic=process.env.HEDERA_TOPIC_ID;
  try{
    process.env.HEDERA_TOPIC_ID='0.0.1234';delete process.env.HEDERA_PRIVATE_KEY;
    const store=new Store(dir);const event=store.append('payment.settled','test-run',{receipt:{success:true}});
    await anchorEvent(store,event);assert.match(store.events()[0].hcsError!,/failed/);assert.equal(store.verify().valid,true);
  }finally{process.env.HEDERA_PRIVATE_KEY=oldKey;if(oldTopic===undefined)delete process.env.HEDERA_TOPIC_ID;else process.env.HEDERA_TOPIC_ID=oldTopic;rmSync(dir,{recursive:true,force:true});}
});
