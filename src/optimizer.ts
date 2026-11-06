import type { Forecast, PlanInput, Load } from './domain.js';

export type Placement = { id: string; name: string; start: number; end: number; kw: number; energyKwh: number; costEur: number; carbonKg: number };
export type Schedule = { placements: Placement[]; hourlyKw: number[]; costEur: number; carbonKg: number; objectiveEur: number; energyKwh: number };

function placement(load: Load, start: number, data: Forecast): Placement {
  const hours = Array.from({ length: load.duration }, (_, i) => start + i);
  return { id: load.id, name: load.name, start, end: start + load.duration, kw: load.kw, energyKwh: load.kw * load.duration,
    costEur: hours.reduce((s, h) => s + load.kw * data.prices[h] / 1000, 0),
    carbonKg: hours.reduce((s, h) => s + load.kw * data.carbon[h] / 1000, 0) };
}
function summarize(placements: Placement[], carbonPrice: number): Schedule {
  const hourlyKw = Array(24).fill(0);
  for (const p of placements) for (let h = p.start; h < p.end; h++) hourlyKw[h] += p.kw;
  const costEur = placements.reduce((s, p) => s + p.costEur, 0);
  const carbonKg = placements.reduce((s, p) => s + p.carbonKg, 0);
  return { placements, hourlyKw, costEur, carbonKg, objectiveEur: costEur + carbonKg / 1000 * carbonPrice,
    energyKwh: placements.reduce((s,p) => s + p.energyKwh, 0) };
}
export function optimize(input: PlanInput, data: Forecast) {
  for (const series of [data.prices, data.carbon, data.temperature])
    if (series.length !== 24 || series.some(x => !Number.isFinite(x))) throw new Error('Forecast must contain 24 finite hourly values');
  if (data.carbon.some(x => x < 0)) throw new Error('Carbon intensity cannot be negative');
  const baseline = summarize(input.loads.map(l => placement(l, l.baseline, data)), input.carbonPrice);
  const candidates = input.loads.map(l => Array.from({length: l.latest - l.earliest - l.duration + 1}, (_, i) => placement(l, l.earliest + i, data))
    .sort((a,b) => (a.costEur + a.carbonKg / 1000 * input.carbonPrice) - (b.costEur + b.carbonKg / 1000 * input.carbonPrice)));
  const score = (p: Placement) => p.costEur + p.carbonKg / 1000 * input.carbonPrice;
  const lower = Array(candidates.length + 1).fill(0);
  for (let i = candidates.length - 1; i >= 0; i--) lower[i] = lower[i+1] + score(candidates[i][0]);
  let best = Infinity; let chosen: Placement[] | null = null; let visited = 0;
  const usage = Array(24).fill(0);
  function search(i: number, cost: number, picks: Placement[]) {
    if (++visited > 2000000) throw new Error('Planning search limit exceeded. Reduce loads or narrow operating windows.');
    if (cost + lower[i] >= best - 1e-9) return;
    if (i === candidates.length) { best = cost; chosen = [...picks]; return; }
    for (const p of candidates[i]) {
      if (usage.slice(p.start, p.end).some(x => x + p.kw > input.capacityKw + 1e-9)) continue;
      for (let h = p.start; h < p.end; h++) usage[h] += p.kw;
      search(i+1, cost + score(p), [...picks, p]);
      for (let h = p.start; h < p.end; h++) usage[h] -= p.kw;
    }
  }
  search(0, 0, []);
  if (!chosen) throw new Error('No feasible schedule fits the connection capacity and operating windows');
  const optimized = summarize(chosen, input.carbonPrice);
  return { baseline, optimized, savingsEur: baseline.costEur - optimized.costEur,
    carbonSavedKg: baseline.carbonKg - optimized.carbonKg,
    baselineExceedsCapacity: baseline.hourlyKw.some(x => x > input.capacityKw), visited };
}
