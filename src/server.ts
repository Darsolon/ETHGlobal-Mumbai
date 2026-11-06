import 'dotenv/config';
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultPlan, fixture, planSchema, providers } from './domain.js';
import { Store } from './store.js';
import { isTestnet, anchorEvent } from './hedera.js';
import { requirements, settlePayment } from './payments.js';
import { runAgent } from './runner.js';

export function createApp(store = new Store()) {
  const app = express(); app.disable('x-powered-by'); app.use(express.json({limit:'32kb'}));
  app.use((_req,res,next) => {
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"}); next();
  });
  const auth: express.RequestHandler = (req,res,next) => {
    if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`) {res.status(403).json({error:'Cross-origin writes are forbidden'});return;}
    if (!isTestnet()) return next();
    const token = process.env.GRID_API_TOKEN || ''; const supplied = req.get('authorization')?.replace(/^Bearer /,'') || '';
    if (!token || supplied.length !== token.length || !timingSafeEqual(Buffer.from(token),Buffer.from(supplied))) {res.status(401).json({error:'An operator token is required in testnet mode'});return;}
    next();
  };
  app.get('/api/health',(_req,res) => res.json({ok:true,mode:isTestnet()?'testnet':'demo'}));
  app.get('/api/config',(_req,res) => res.json({defaults:defaultPlan,providers,mode:isTestnet()?'testnet':'demo',
    readiness:{payer:!!process.env.HEDERA_ACCOUNT_ID,merchant:!!process.env.HEDERA_MERCHANT_ID,topic:process.env.HEDERA_TOPIC_ID || null,operatorToken:!!process.env.GRID_API_TOKEN}, budget:store.totals()}));
  app.get('/api/audit',(_req,res) => res.json({events:store.events(),integrity:store.verify()}));
  app.get('/.well-known/gridagent.json',(_req,res) => res.json({name:'GridAgent data marketplace',network:isTestnet()?'hedera:testnet':'demo:local',x402Version:2,synthetic:true,providers:providers.map(p=>({...p,endpoint:`/api/data/${p.id}`}))}));
  app.get('/api/data/:provider',async(req,res) => {
    const p = providers.find(p=>p.id===req.params.provider); if(!p){res.status(404).json({error:'Unknown provider'});return;}
    try {
      const expected = await requirements(p);
      const header = req.get('PAYMENT-SIGNATURE') || req.get('X-Payment');
      if(!header){ const body={x402Version:2,resource:{url:`/api/data/${p.id}`,description:p.description,mimeType:'application/json'},accepts:[expected]};
        res.set('PAYMENT-REQUIRED',Buffer.from(JSON.stringify(body)).toString('base64')).status(402).json(body);return; }
      if(header.length>20000) throw new Error('Payment header too large');
      const payload = JSON.parse(Buffer.from(header,'base64').toString('utf8'));
      const receipt = await settlePayment(store,payload,expected);
      const event=store.append('merchant.receipt', 'merchant', {providerId:p.id,amountMicros:p.priceMicros,receipt});
      await anchorEvent(store,event);
      const sample=fixture();
      const forecast={source:sample.source,synthetic:true,...(p.kind==='prices'?{prices:sample.prices}:p.kind==='carbon'?{carbon:sample.carbon}:{temperature:sample.temperature})};
      res.set('PAYMENT-RESPONSE',Buffer.from(JSON.stringify(receipt)).toString('base64')).json({provider:p,forecast,receipt});
    } catch(e) { res.status(402).json({error:(e as Error).message}); }
  });
  let running=false;
  app.post('/api/run',auth,async(req,res) => {
    const parsed=planSchema.safeParse(req.body); if(!parsed.success){res.status(400).json({error:parsed.error.issues.map(i=>i.message).join('; ')});return;}
    const key=req.get('Idempotency-Key'); if(!key||!/^[a-zA-Z0-9-]{8,100}$/.test(key)){res.status(400).json({error:'Provide an Idempotency-Key (8–100 letters, digits or hyphens)'});return;}
    if(running){res.status(409).json({error:'A planning run is in progress'});return;}
    running=true;
    try {
      // Origin is bound by the actual listener, never by a caller-controlled Host header.
      const address=req.socket.localPort;
      res.json(await runAgent(store,parsed.data,`http://127.0.0.1:${address}`,key));
    } catch(e){res.status(422).json({error:(e as Error).message});} finally{running=false;}
  });
  app.use(express.static(resolve('public')));
  app.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(400).json({error:'Invalid request body'}));
  return app;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  if (process.env.GRID_MODE && !['demo','testnet'].includes(process.env.GRID_MODE)) throw new Error('Only demo and testnet modes are supported');
  if(isTestnet()&&!process.env.GRID_API_TOKEN) throw new Error('Set GRID_API_TOKEN before enabling testnet mode');
  const port=Number(process.env.PORT||4402); createApp().listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`GridAgent http://localhost:${port} (${isTestnet()?'testnet':'demo'})`));
}
