import { defineTool } from 'eve/tools';
import { z } from 'zod';

export default defineTool({
  description: 'Plan the default factory shift through the governed GridAgent service. Executes autonomous paid requests within server-side ceilings. Reuse requestId when retrying the same operation. Does not dispatch machinery.',
  inputSchema: z.object({ requestId: z.string().regex(/^[a-zA-Z0-9-]{8,100}$/), carbonPrice: z.number().min(0).max(500).default(60), budgetUsdc: z.number().min(0).max(0.1).default(0.06) }),
  async execute({ requestId, carbonPrice, budgetUsdc }) {
    const origin = process.env.GRID_SERVER_URL || 'http://127.0.0.1:4402';
    const configResponse = await fetch(origin + '/api/config', { signal: AbortSignal.timeout(10000) });
    if (!configResponse.ok) throw new Error('GridAgent service is unavailable');
    const config = await configResponse.json() as { defaults: Record<string, unknown> };
    const headers: Record<string,string> = { 'content-type':'application/json', 'idempotency-key':requestId };
    if (process.env.GRID_API_TOKEN) headers.authorization = 'Bearer ' + process.env.GRID_API_TOKEN;
    const response = await fetch(origin + '/api/run', { method:'POST', headers,
      body: JSON.stringify({ ...config.defaults, carbonPrice, budgetMicros:Math.round(budgetUsdc*1e6) }), signal:AbortSignal.timeout(240000) });
    const result = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(result));
    return result;
  },
});
