import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlan, fixture, planSchema } from '../src/domain.js';
import { optimize } from '../src/optimizer.js';

test('schedule conserves energy, respects continuous windows and capacity, and improves the objective',()=>{
  const r=optimize(defaultPlan,fixture());
  assert.equal(r.optimized.energyKwh,r.baseline.energyKwh);
  assert.ok(r.optimized.objectiveEur<=r.baseline.objectiveEur);
  assert.ok(r.optimized.hourlyKw.every(x=>x<=defaultPlan.capacityKw));
  for(const p of r.optimized.placements){const l=defaultPlan.loads.find(l=>l.id===p.id)!;assert.ok(p.start>=l.earliest);assert.ok(p.end<=l.latest);assert.equal(p.end-p.start,l.duration);}
  assert.ok(r.savingsEur>100);
});
test('global search agrees with exhaustive enumeration when capacity causes competition',()=>{
  const input={...defaultPlan,capacityKw:100,loads:[{id:'a',name:'A',kw:100,duration:2,earliest:0,latest:7,baseline:0},{id:'b',name:'B',kw:100,duration:3,earliest:0,latest:7,baseline:3}]};
  const f=fixture();let best=Infinity;
  for(let a=0;a<=5;a++)for(let b=0;b<=4;b++){
    if(a<b+3&&b<a+2)continue;
    let score=0;
    for(const [start,duration] of [[a,2],[b,3]])for(let h=start;h<start+duration;h++)score+=100*f.prices[h]/1000+100*f.carbon[h]/1e6*input.carbonPrice;
    best=Math.min(best,score);
  }
  assert.ok(Math.abs(optimize(input,f).optimized.objectiveEur-best)<1e-8);
});
test('supports negative market prices without invalid pruning',()=>{
  const f=fixture();f.prices[5]=-1000;const p={...defaultPlan,loads:[{...defaultPlan.loads[0],duration:1}]};
  assert.equal(optimize(p,f).optimized.placements[0].start,5);
});
test('rejects infeasible factories and malformed forecasts',()=>{
  assert.throws(()=>optimize({...defaultPlan,capacityKw:50},fixture()),/No feasible/);
  assert.throws(()=>optimize(defaultPlan,{...fixture(),prices:[NaN]}),/24 finite/);
  assert.equal(planSchema.safeParse({...defaultPlan,loads:[{...defaultPlan.loads[0],duration:25}]}).success,false);
  assert.equal(planSchema.safeParse({...defaultPlan,budgetMicros:-1}).success,false);
});
