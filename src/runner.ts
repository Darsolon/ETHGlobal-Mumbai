import { randomUUID } from 'node:crypto';
import { defaultPlan, fixture, providers, type PlanInput, type Forecast } from './domain.js';
import { optimize } from './optimizer.js';
import { Store, digest } from './store.js';
import { anchorEvent, isTestnet } from './hedera.js';
import { signPayment } from './payments.js';

export function ceiling(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid server limit: ${name}`);
  return value;
}
export async function runAgent(store: Store, input: PlanInput, origin: string, idempotencyKey: string) {
  const previous = store.getRun(idempotencyKey) as any;
  if (previous) {
    if (previous.inputHash !== digest(input)) throw new Error('Idempotency key already used with different input');
    if (previous.result) return previous.result;
    throw new Error('Run is pending or failed. Review its audit trail before starting a new run.');
  }
  // Check feasibility before buying data. A payment should never be needed to reject an impossible factory.
  optimize(input, fixture());
  const runId = randomUUID();
  store.setRun(idempotencyKey, {runId, inputHash: digest(input), status:'running'});
  const log = async (type: string, detail: Record<string,unknown>) => {
    const e = store.append(type, runId, detail); await anchorEvent(store, e);
  };
  const decisions: { providerId: string; status: string; reason: string; priceMicros: number; receipt?: any }[] = [];
  const purchased: Partial<Forecast> = {};
  let spentMicros = 0;
  try {
    await log('run.started', { inputHash: digest(input), mode: isTestnet() ? 'testnet' : 'demo', loadCount: input.loads.length });
    const discoveryResponse=await fetch(origin+'/.well-known/gridagent.json',{signal:AbortSignal.timeout(10000)});
    if(!discoveryResponse.ok) throw new Error('Provider discovery failed');
    const discovery=await discoveryResponse.json();
    if(!Array.isArray(discovery.providers)) throw new Error('Invalid provider directory');
    const discovered=providers.filter(p=>discovery.providers.some((d:any)=>d.id===p.id&&d.endpoint===`/api/data/${p.id}`&&d.priceMicros===p.priceMicros));
    await log('providers.discovered',{providerIds:discovered.map(p=>p.id),source:'/.well-known/gridagent.json'});
    // Deterministic value-of-information policy. Seller value estimates are heuristic, never promised savings.
    const selectedKinds = new Set<string>();
    for (const p of [...discovered].sort((a,b) => a.priceMicros - b.priceMicros)) {
      let reason = '';
      if (p.kind === 'weather') reason = 'Skipped: weather does not change any fixed load constraint in this model.';
      else if (p.kind === 'carbon' && input.carbonPrice === 0) reason = 'Skipped: carbon has zero weight in this objective.';
      else if (selectedKinds.has(p.kind)) reason = 'Skipped: a lower-priced provider already supplied this data category.';
      else if (p.estimatedValueEur <= 0) reason = 'Skipped: no estimated marginal planning value.';
      else if (p.priceMicros > Math.min(input.approvalMicros, ceiling('AUTO_APPROVE_MICROS',20000))) reason = 'Approval required: quote exceeds autonomous payment threshold. No payment was signed.';
      if (reason) {
        const d = { providerId:p.id, status:reason.startsWith('Approval')?'approval-required':'skipped', reason, priceMicros:p.priceMicros };
        decisions.push(d); await log('provider.declined', d); continue;
      }
      let reservation: string;
      try { reservation = store.reserve(p.id, p.priceMicros, Math.min(input.budgetMicros, ceiling('DAILY_BUDGET_MICROS',100000)), Math.min(input.providerLimitMicros, ceiling('PROVIDER_LIMIT_MICROS',50000))); }
      catch (e) {
        const d = {providerId:p.id,status:'blocked',reason:(e as Error).message,priceMicros:p.priceMicros}; decisions.push(d); await log('payment.blocked',d); continue;
      }
      // Retain reservation on any ambiguous network outcome. This errs toward refusing further spend.
      await log('payment.reserved', {providerId:p.id, reservation, amountMicros:p.priceMicros});
      const url = `${origin}/api/data/${p.id}`;
      const challenge = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (challenge.status !== 402) throw new Error('Merchant did not return an x402 challenge');
      const required = await challenge.json();
      const accepted = required.accepts?.[0];
      if (!accepted || accepted.amount !== String(p.priceMicros) || accepted.scheme !== 'exact' || accepted.network !== (isTestnet()?'hedera:testnet':'demo:local')) throw new Error('Merchant quote changed; refusing to sign');
      await log('payment.challenged', {providerId:p.id, httpStatus:402, accepted});
      const payload = await signPayment(accepted, url);
      const response = await fetch(url, {headers:{'PAYMENT-SIGNATURE':Buffer.from(JSON.stringify(payload)).toString('base64')}, signal:AbortSignal.timeout(60000)});
      if (!response.ok) throw new Error(`Paid request failed (HTTP ${response.status}); budget reservation retained`);
      const data = await response.json();
      if (!data.receipt?.success) throw new Error('Missing successful payment receipt');
      store.finishReservation(reservation,'spent'); spentMicros += p.priceMicros;
      selectedKinds.add(p.kind);
      if (p.kind === 'prices') purchased.prices = data.forecast.prices;
      if (p.kind === 'carbon') purchased.carbon = data.forecast.carbon;
      const d = {providerId:p.id, status:'purchased',reason:'Lowest-price useful provider in this category; within all spending controls.',priceMicros:p.priceMicros,receipt:data.receipt};
      decisions.push(d); await log('payment.settled',d);
    }
    const sample = fixture();
    // Missing data never silently becomes a free premium feed. Coarse priors are explicit in the result.
    const forecast: Forecast = { ...sample, prices:purchased.prices || Array(24).fill(100), carbon:purchased.carbon || Array(24).fill(350), source:'Synthetic 24-hour scenario; unpurchased series use flat priors' };
    const schedule = optimize(input,forecast);
    const result = { runId, time:new Date().toISOString(), mode:isTestnet()?'testnet':'demo', input, forecast, ...schedule, decisions, spentMicros,
      policy:'Rule-based value-of-information planner; optional eve language-agent orchestration',
      assumptions:['24 fixed hourly slots; no DST transition day modeling','Continuous, non-preemptible loads; no battery discharge or thermal dynamics','Wholesale energy only; excludes taxes, grid fees, demand tariffs and currency conversion','Synthetic inputs; savings are modeled, not guaranteed; no equipment actuation'],
      dataCoverage:{prices:!!purchased.prices,carbon:!!purchased.carbon,weather:false} };
    await log('schedule.committed',{ scheduleHash:digest(result.optimized), forecastHash:digest(forecast), savingsEur:result.savingsEur, carbonSavedKg:result.carbonSavedKg, spentMicros });
    store.setRun(idempotencyKey,{runId,inputHash:digest(input),status:'complete',result}); return result;
  } catch (e) {
    await log('run.failed',{reason:(e as Error).message});
    store.setRun(idempotencyKey,{runId,inputHash:digest(input),status:'failed'}); throw e;
  }
}
