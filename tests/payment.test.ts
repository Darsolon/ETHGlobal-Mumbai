import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { createApp } from '../src/server.js';
import { defaultPlan, providers } from '../src/domain.js';
import { requirements, signPayment, settlePayment } from '../src/payments.js';
import { PrivateKey, inspectHederaTransaction } from '@x402/hedera';

test('budget reservations survive restart; failed or pending payment cannot reset budget',()=>{
  const dir=mkdtempSync(join(tmpdir(),'gridagent-'));
  try{
    let s=new Store(dir);const id=s.reserve('merchant',12000,18000,12000);
    assert.throws(()=>s.reserve('merchant',1,18000,12000),/Provider/);
    s=new Store(dir);assert.equal(s.totals().total,12000);
    assert.throws(()=>s.reserve('other',7000,18000,12000),/Daily/);
    s.finishReservation(id,'released');assert.equal(s.totals().total,0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('audit tampering is detected before opening the journal',()=>{
  const dir=mkdtempSync(join(tmpdir(),'gridagent-'));
  try{const s=new Store(dir);s.append('decision','run',{amount:12000});assert.equal(s.verify().valid,true);
    const path=join(dir,'state.json');const data=JSON.parse(readFileSync(path,'utf8'));data.events[0].detail.amount=1;writeFileSync(path,JSON.stringify(data));assert.throws(()=>new Store(dir),/integrity/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('signed demo authorization is bound to the quote and cannot be replayed',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gridagent-'));
  try{const s=new Store(dir);const req=await requirements(providers[0]);const payload=await signPayment(req,'http://localhost/api/data/gridpulse');
    await assert.rejects(()=>settlePayment(s,{...payload,accepted:{...req,amount:'1'}},req),/does not match/);
    const receipt=await settlePayment(s,payload,req);assert.equal(receipt.simulated,true);assert.equal(receipt.transactionId,null);
    await assert.rejects(()=>settlePayment(s,payload,req),/already submitted/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('HTTP agent executes 402 → signed retry → receipt → optimized schedule; replay never charges twice',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gridagent-'));const store=new Store(dir);const server=createApp(store).listen(0,'127.0.0.1');
  await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
  try{
    const challenge=await fetch(base+'/api/data/gridpulse');assert.equal(challenge.status,402);assert.ok(challenge.headers.get('payment-required'));
    const options={method:'POST',headers:{'content-type':'application/json','idempotency-key':'test-plan-001'},body:JSON.stringify(defaultPlan)};
    const response=await fetch(base+'/api/run',options);const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
    assert.equal(body.spentMicros,18000);assert.equal(body.decisions.filter((d:any)=>d.status==='purchased').length,2);
    assert.ok(body.decisions.find((d:any)=>d.providerId==='meteoflow').reason.includes('does not change'));
    assert.ok(body.savingsEur>100);assert.equal(store.verify().valid,true);
    const before=store.totals().total;const repeat=await fetch(base+'/api/run',options);assert.equal((await repeat.json()).runId,body.runId);assert.equal(store.totals().total,before);
    const blocked=await fetch(base+'/api/run',{...options,headers:{...options.headers,'idempotency-key':'test-plan-002'},body:JSON.stringify({...defaultPlan,budgetMicros:0})});
    const plan=await blocked.json();assert.equal(plan.spentMicros,0);assert.equal(store.totals().total,before);assert.equal(plan.dataCoverage.prices,false);
    const cross=await fetch(base+'/api/run',{...options,headers:{...options.headers,origin:'https://attacker.invalid'}});assert.equal(cross.status,403);
    const bad=await fetch(base+'/api/run',{...options,body:JSON.stringify({...defaultPlan,budgetMicros:-1})});assert.equal(bad.status,400);
  }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));rmSync(dir,{recursive:true,force:true});}
});
test('approval threshold prevents signing and never spends',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gridagent-'));const store=new Store(dir);const server=createApp(store).listen(0,'127.0.0.1');
  await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
  try{const r=await fetch(base+'/api/run',{method:'POST',headers:{'content-type':'application/json','idempotency-key':'approval-001'},body:JSON.stringify({...defaultPlan,approvalMicros:0})});const body=await r.json();assert.equal(body.spentMicros,0);assert.equal(store.totals().total,0);assert.ok(body.decisions.some((d:any)=>d.status==='approval-required'));}
  finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));rmSync(dir,{recursive:true,force:true});}
});
test('official Hedera signer produces a complete v2 payload with the exact HTS transfer, without submitting it',async()=>{
  const names=['GRID_MODE','HEDERA_ACCOUNT_ID','HEDERA_PRIVATE_KEY','HEDERA_MERCHANT_ID','HEDERA_USDC_TOKEN_ID'];
  const previous=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  try{
    process.env.GRID_MODE='testnet';process.env.HEDERA_ACCOUNT_ID='0.0.1111';process.env.HEDERA_PRIVATE_KEY=PrivateKey.generateED25519().toStringDer();process.env.HEDERA_MERCHANT_ID='0.0.2222';process.env.HEDERA_USDC_TOKEN_ID='0.0.429274';
    const accepted={scheme:'exact',network:'hedera:testnet' as const,asset:'0.0.429274',amount:'12000',payTo:'0.0.2222',maxTimeoutSeconds:180,extra:{feePayer:'0.0.3333'}};
    const signed=await signPayment(accepted,'http://localhost/api/data/gridpulse');
    assert.deepEqual(signed.accepted,accepted);assert.equal(signed.x402Version,2);
    const inspected=inspectHederaTransaction(signed.payload.transaction as string);
    assert.equal(inspected.transactionIdAccountId,'0.0.3333');
    assert.ok(inspected.tokenTransfers['0.0.429274'].some(t=>t.accountId==='0.0.2222'&&t.amount==='12000'));
    assert.ok(inspected.tokenTransfers['0.0.429274'].some(t=>t.accountId==='0.0.1111'&&t.amount==='-12000'));
    await assert.rejects(()=>signPayment({...accepted,payTo:'0.0.9999'},'http://localhost'),/Untrusted/);
  }finally{for(const k of names){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}}
});
