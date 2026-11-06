import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultPlan} from '../src/domain.js';

test('public browser demo enforces shared budgets and serializes overlapping runs without network settlement',async()=>{
 const saved=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{value:{getItem:(key:string)=>saved.get(key)||null,setItem:(key:string,value:string)=>saved.set(key,value)},configurable:true});
 Object.defineProperty(globalThis,'window',{value:{},configurable:true});
 await import('../src/browser-demo.js');
 const api=window.gridStaticApi;
 const run=(overrides={})=>api('/api/run',{body:JSON.stringify({...defaultPlan,...overrides})}) as Promise<any>;
 const first=run();
 await assert.rejects(run(),/already in progress/);
 const result=await first;
 assert.equal(result.spentMicros,18000);
 assert.equal(result.savingsEur,122.14);
 assert.equal(result.decisions.filter((d:any)=>d.status==='purchased').length,2);
 for(const d of result.decisions.filter((d:any)=>d.receipt)){
  assert.equal(d.receipt.simulated,true);
  assert.equal(d.receipt.transactionId,null);
 }
 const blocked=await run({budgetMicros:18000});
 assert.equal(blocked.spentMicros,0);
 assert.equal(blocked.dataCoverage.prices,false);
 assert.ok(blocked.decisions.some((d:any)=>d.status==='blocked'));
 const config:any=await api('/api/config');
 assert.equal(config.budget.total,18000);
 const audit:any=await api('/api/audit');
 assert.equal(audit.integrity.valid,true);
 assert.ok(audit.events.every((e:any)=>!e.hcs?.transactionId));
 assert.ok(saved.size>0);
});
