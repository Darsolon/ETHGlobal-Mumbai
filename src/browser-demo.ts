import {defaultPlan,fixture,providers,planSchema} from './domain.js';
import {optimize} from './optimizer.js';

declare global {interface Window {gridStaticApi:(url:string,options?:RequestInit)=>Promise<unknown>}}
const storageKey='gridagent-public-demo-v1';
type State={day:string,total:number,byProvider:Record<string,number>,events:any[]};
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(new Date());
let state:State;
try{state=JSON.parse(localStorage.getItem(storageKey)||'null');if(!state||state.day!==day())throw Error();}catch{state={day:day(),total:0,byProvider:{},events:[]};}
const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{}};
const hash=async(data:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data))))).map(b=>b.toString(16).padStart(2,'0')).join('');
async function append(type:string,runId:string,detail:unknown){const body={id:crypto.randomUUID(),time:new Date().toISOString(),type,runId,detail,previousHash:state.events.at(-1)?.hash||'0'.repeat(64)};state.events.push({...body,hash:await hash(body)});save();}
async function integrity(){let previous='0'.repeat(64);for(const e of state.events){const{hash:stored,...body}=e;if(body.previousHash!==previous||await hash(body)!==stored)return {valid:false,count:state.events.length};previous=stored;}return{valid:true,count:state.events.length,head:previous};}
let running=false;
window.gridStaticApi=async(url,options)=>{
 if(state.day!==day()){state={day:day(),total:0,byProvider:{},events:[]};save();}
 if(url==='/api/config')return {defaults:defaultPlan,providers,mode:'demo',deployment:'browser',readiness:{payer:false,merchant:false,topic:null,operatorToken:false},budget:{day:state.day,total:state.total,byProvider:state.byProvider}};
 if(url==='/api/audit')return {events:state.events,integrity:await integrity()};
 if(url!=='/api/run')throw Error('Unavailable in the public browser demo');
 if(running)throw Error('A planning run is already in progress');
 const input=planSchema.parse(JSON.parse(String(options?.body)));optimize(input,fixture());
 if(!(await integrity()).valid)throw Error('Local demo audit integrity failed. Use the server-backed app for independent verification.');
 const runId=crypto.randomUUID(),decisions:any[]=[],data=fixture();let spentMicros=0;
 const kinds=new Set<string>();running=true;
 try{
 await append('run.started',runId,{mode:'browser-demo',synthetic:true});
 for(const p of [...providers].sort((a,b)=>a.priceMicros-b.priceMicros)){
  let reason='',status='skipped';
  if(p.kind==='weather')reason='Skipped: weather does not change this fixed-load model.';
  else if(p.kind==='carbon'&&input.carbonPrice===0)reason='Skipped: carbon has zero objective weight.';
  else if(kinds.has(p.kind))reason='Skipped: a cheaper provider supplied this category.';
  else if(p.priceMicros>Math.min(20000,input.approvalMicros)){reason='Approval required: autonomous threshold exceeded.';status='approval-required';}
  else if(state.total+p.priceMicros>Math.min(100000,input.budgetMicros)||(state.byProvider[p.id]||0)+p.priceMicros>Math.min(50000,input.providerLimitMicros)){reason='Daily or per-provider demo budget reached.';status='blocked';}
  if(reason){const d={providerId:p.id,status,reason,priceMicros:p.priceMicros};decisions.push(d);await append('provider.declined',runId,d);continue;}
  await append('payment.challenged',runId,{providerId:p.id,simulated:true,httpStatus:402,amountMicros:p.priceMicros,note:'Browser-only demonstration; no network payment request'});
  state.total+=p.priceMicros;state.byProvider[p.id]=(state.byProvider[p.id]||0)+p.priceMicros;spentMicros+=p.priceMicros;kinds.add(p.kind);
  const receipt={success:true,network:'demo:local',transactionId:null,demoReceiptId:'demo-'+crypto.randomUUID(),simulated:true};
  const d={providerId:p.id,status:'purchased',reason:'Lowest-price useful category; simulated purchase within browser-local controls.',priceMicros:p.priceMicros,receipt};decisions.push(d);await append('payment.simulated',runId,d);
 }
 if(!kinds.has('prices'))data.prices=Array(24).fill(100);if(!kinds.has('carbon'))data.carbon=Array(24).fill(350);
 const schedules=optimize(input,data);
 const result={runId,time:new Date().toISOString(),mode:'demo',input,forecast:data,...schedules,decisions,spentMicros,dataCoverage:{prices:kinds.has('prices'),carbon:kinds.has('carbon'),weather:false},assumptions:['Public browser simulation; no HTTP payment or blockchain settlement','Local budgets and audit can be reset by the browser owner; no security guarantee','Synthetic 24-slot scenario; wholesale energy and carbon only; no physical dispatch']};
 await append('schedule.committed',runId,{scheduleHash:await hash(result.optimized),forecastHash:await hash(data),savingsEur:result.savingsEur,spentMicros});return result;
 }finally{running=false;}
};
