import { z } from 'zod';

export const loadSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,30}$/), name: z.string().min(1).max(60),
  kw: z.number().positive().max(5000), duration: z.number().int().min(1).max(24),
  earliest: z.number().int().min(0).max(23), latest: z.number().int().min(1).max(24),
  baseline: z.number().int().min(0).max(23),
}).refine(l => l.earliest + l.duration <= l.latest && l.baseline >= l.earliest && l.baseline + l.duration <= l.latest,
  'Load duration and baseline must fit within its operating window');
export const planSchema = z.object({
  loads: z.array(loadSchema).min(1).max(6),
  capacityKw: z.number().positive().max(15000),
  carbonPrice: z.number().min(0).max(500),
  budgetMicros: z.number().int().min(0).max(1000000),
  providerLimitMicros: z.number().int().min(0).max(1000000),
  approvalMicros: z.number().int().min(0).max(1000000),
}).refine(p => new Set(p.loads.map(l => l.id)).size === p.loads.length, 'Load IDs must be unique');
export type Load = z.infer<typeof loadSchema>;
export type PlanInput = z.infer<typeof planSchema>;
export type Forecast = { prices: number[]; carbon: number[]; temperature: number[]; source: string; synthetic: boolean };
export type Provider = { id: string; name: string; kind: 'prices' | 'carbon' | 'weather'; priceMicros: number; confidence: number; estimatedValueEur: number; description: string };
export const defaultPlan: PlanInput = {
  loads: [
    { id: 'compressor', name: 'Air compressor', kw: 180, duration: 4, earliest: 0, latest: 24, baseline: 8 },
    { id: 'cooling', name: 'Process cooling', kw: 120, duration: 6, earliest: 0, latest: 24, baseline: 9 },
    { id: 'battery', name: 'Battery charging', kw: 100, duration: 3, earliest: 0, latest: 20, baseline: 17 },
  ], capacityKw: 400, carbonPrice: 60, budgetMicros: 60000, providerLimitMicros: 30000, approvalMicros: 20000,
};
export const providers: Provider[] = [
  { id: 'gridpulse', name: 'GridPulse', kind: 'prices', priceMicros: 12000, confidence: 96, estimatedValueEur: 48, description: '24 hourly electricity prices · DE-LU' },
  { id: 'eurospot', name: 'EuroSpot', kind: 'prices', priceMicros: 24000, confidence: 98, estimatedValueEur: 49, description: 'Premium day-ahead price curve · DE-LU' },
  { id: 'carbonlens', name: 'CarbonLens', kind: 'carbon', priceMicros: 6000, confidence: 91, estimatedValueEur: 8, description: 'Hourly grid carbon intensity · gCO₂/kWh' },
  { id: 'meteoflow', name: 'MeteoFlow', kind: 'weather', priceMicros: 3000, confidence: 94, estimatedValueEur: 0, description: 'Temperature forecast · no marginal value for fixed cooling load' },
];
export function fixture(): Forecast {
  return {
    prices: [64,52,43,39,44,62,104,139,158,142,112,85,62,48,51,78,126,181,194,163,128,103,85,72],
    carbon: [330,310,290,275,280,305,340,390,410,370,300,245,210,190,205,260,340,410,435,420,395,370,350,340],
    temperature: [9,8,8,7,7,8,9,11,13,15,17,18,19,20,20,19,17,15,13,12,11,10,10,9],
    source: 'Synthetic German industrial scenario, not live market data', synthetic: true,
  };
}
