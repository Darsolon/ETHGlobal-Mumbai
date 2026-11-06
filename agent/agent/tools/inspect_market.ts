import { defineTool } from 'eve/tools';
import { z } from 'zod';

export default defineTool({
  description: 'Inspect GridAgent provider discovery, testnet readiness, factory defaults and today’s budget usage. Read-only.',
  inputSchema: z.object({}),
  async execute() {
    const origin = process.env.GRID_SERVER_URL || 'http://127.0.0.1:4402';
    const response = await fetch(origin + '/api/config', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('GridAgent service is unavailable');
    return response.json();
  },
});
