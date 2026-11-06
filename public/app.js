const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const escapeHtml = (v) => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n,d=0) => Number(n).toLocaleString('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d});
let config, result, scheduleMode='optimized';
const titles={overview:['Overview','A smarter shift starts here.','Move your flexible loads. Keep your production moving.'],loads:['Flexible loads','Built around your factory.','Your constraints are the starting point for every plan.'],marketplace:['Data marketplace','A little signal goes a long way.','Discover providers. Compare prices. Buy only what matters.'],audit:['Audit trail','Trust, with receipts.','A clear record of every purchase and scheduling decision.'],controls:['Spending controls','You set the boundaries.','The agent works inside them, before every payment.']};
function view(name){
  if(!titles[name])return;
  $$('[data-panel]').forEach(e=>e.hidden=e.dataset.panel!==name);
  $$('.nav-item').forEach(e=>e.classList.toggle('active',e.dataset.view===name));
  $('#view-title').textContent=titles[name][0];$('#page-heading').textContent=titles[name][1];$('#page-subheading').textContent=titles[name][2];
  if(name==='audit')loadAudit();
}
$$('[data-view]').forEach(e=>e.onclick=()=>view(e.dataset.view));
$$('[data-go]').forEach(e=>e.onclick=()=>view(e.dataset.go));
function message(text,error=false){const el=$('#message');el.hidden=false;el.textContent=text;el.classList.toggle('error',error);}
async function api(url,options){const r=await fetch(url,options);const data=await r.json();if(!r.ok)throw Error(data.error||`Request failed (${r.status})`);return data;}
function renderInputs(){
  $('#load-inputs').innerHTML=config.defaults.loads.map(l=>`<tr data-load="${l.id}"><td><strong>${escapeHtml(l.name)}</strong></td>${['kw','duration','earliest','latest','baseline'].map(k=>`<td><input type="number" data-field="${k}" aria-label="${escapeHtml(l.name)} ${k}" value="${l[k]}" min="${['kw','duration','latest'].includes(k)?1:0}" max="${k==='kw'?5000:k==='baseline'||k==='earliest'?23:24}" step="1"></td>`).join('')}</tr>`).join('');
}
function input(){return {...config.defaults,loads:config.defaults.loads.map(l=>({...l,...Object.fromEntries([...document.querySelector(`[data-load="${l.id}"]`).querySelectorAll('input')].map(i=>[i.dataset.field,Number(i.value)]))})),capacityKw:Number($('#capacity').value),carbonPrice:Number($('#carbon-price').value),budgetMicros:Math.round(Number($('#daily-budget').value)*1e6),providerLimitMicros:Math.round(Number($('#provider-limit').value)*1e6),approvalMicros:Math.round(Number($('#approval-limit').value)*1e6)};}
$('#reset-loads').onclick=()=>{renderInputs();$('#capacity').value=config.defaults.capacityKw;$('#carbon-price').value=config.defaults.carbonPrice;message('Factory loads reset. Run the planner to create a new schedule.');};
$('#run').onclick=async()=>{
  const btn=$('#run');btn.disabled=true;btn.innerHTML='<span>ϟ</span> Planning shift…';$('#export').disabled=true;
  message(config.mode==='testnet'?'Discovering providers and settling eligible testnet payments. This may take a minute.':'Discovering providers, checking policy, and simulating paid data requests…');
  $('#agent-summary').textContent='Comparing providers and enforcing spending limits';
  try{
    const headers={'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()};
    if($('#operator-token').value)headers.Authorization='Bearer '+$('#operator-token').value;
    result=await api('/api/run',{method:'POST',headers,body:JSON.stringify(input())});renderResult();
    message(`Shift planned. ${result.decisions.filter(d=>d.status==='purchased').length} useful datasets acquired for ${fmt(result.spentMicros/1e6,3)} ${result.mode==='demo'?'simulated ':''}USDC. ${result.baselineExceedsCapacity?'Warning: your current schedule exceeds connection capacity; the new plan is feasible.':''}`);
    view('overview');
  }catch(e){message(e.message,true);$('#agent-summary').textContent='Run needs attention — review the audit trail';}
  finally{btn.disabled=false;btn.innerHTML='<span>ϟ</span> Plan next shift <span>↗</span>';$('#export').disabled=!result;}
};
function renderResult(){
  $('#savings').innerHTML=`€${fmt(result.savingsEur,2)}<small> / shift</small>`;
  $('#savings-percent').textContent=`${fmt(result.savingsEur/result.baseline.costEur*100,1)}% modeled reduction`;
  $('#carbon').innerHTML=`${fmt(result.carbonSavedKg,1)}<small> kg CO₂</small>`;
  $('#carbon-note').textContent=`${fmt(result.optimized.carbonKg,1)} kg in the optimized plan`;
  $('#spend').innerHTML=`${fmt(result.spentMicros/1e6,3)}<small> ${result.mode==='demo'?'sim. ':''}USDC</small>`;
  $('#budget-note').textContent=`${fmt(result.input.budgetMicros/1e6,3)} USDC daily limit`;
  $('#energy').innerHTML=`${fmt(result.optimized.energyKwh)}<small> kWh</small>`;
  $('#load-note').textContent=`${result.input.loads.length} loads · all windows respected`;
  $('#chart-insight').textContent=result.dataCoverage.prices?'Useful price data acquired. Lower-cost windows selected.':'No price data purchased. Flat-price prior used.';
  $('#agent-summary').textContent=`Plan complete · ${result.decisions.filter(d=>d.status==='purchased').length} paid datasets · ${result.mode==='demo'?'simulated':'testnet'}`;
  $$('.agent-steps b').forEach(e=>e.textContent='✓');$('.live-tag').textContent='COMPLETE';
  renderChart();renderSchedule();renderProviders();
}
function renderChart(){
  const width=650,height=220,left=32,right=10,top=16,bottom=27,cw=width-left-right,ch=height-top-bottom;
  const prices=result.forecast.prices;const min=Math.min(0,...prices),max=Math.max(200,...prices);const step=cw/24;
  const y=p=>top+ch-(p-min)/(max-min)*ch;const x=h=>left+step*(h+.5);
  const windows=result.optimized.hourlyKw.map((kw,h)=>kw?`<rect x="${left+h*step}" y="${top}" width="${step}" height="${ch}" fill="#f1f6e3"/>`:'').join('');
  const grid=Array.from({length:5},(_,i)=>{const p=min+(max-min)*i/4;return `<line x1="${left}" x2="${width-right}" y1="${y(p)}" y2="${y(p)}" stroke="#edf0e5" stroke-dasharray="3 4"/><text x="${left-9}" y="${y(p)+3}" text-anchor="end">${Math.round(p)}</text>`;}).join('');
  const points=prices.map((p,h)=>`${x(h)},${y(p)}`).join(' ');
  const area=`${x(0)},${y(min)} ${points} ${x(23)},${y(min)}`;
  $('#price-chart').innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Hourly electricity prices and planned operating hours"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#aabd78" stop-opacity=".25"/><stop offset="1" stop-color="#aabd78" stop-opacity="0"/></linearGradient></defs>${windows}${grid}<polygon points="${area}" fill="url(#area)"/><polyline points="${points}" fill="none" stroke="#8ba05d" stroke-width="2" stroke-linejoin="round"/>${prices.map((p,h)=>`<circle cx="${x(h)}" cy="${y(p)}" r="2.2" fill="#fff" stroke="#8ba05d"><title>${String(h).padStart(2,'0')}:00 · €${p}/MWh · ${result.optimized.hourlyKw[h]} kW scheduled</title></circle>`).join('')}${prices.map((_,h)=>h%3===0?`<text x="${x(h)}" y="${height-9}" text-anchor="middle">${String(h).padStart(2,'0')}:00</text>`:'').join('')}</svg>`;
}
function renderSchedule(){if(!result)return;
 const schedule=result[scheduleMode];
 $('#schedule').innerHTML=`<div class="schedule-axis"><span></span><div class="hours">${Array.from({length:24},(_,h)=>`<span>${String(h).padStart(2,'0')}</span>`).join('')}</div></div>${schedule.placements.map((p,i)=>`<div class="load-row"><div class="load-identity"><span>${['▥','❄','ϟ'][i%3]}</span><div>${escapeHtml(p.name)}<small>${p.kw} kW · ${p.end-p.start}h · €${fmt(p.costEur,2)}</small></div></div><div class="load-track"><div class="load-block" style="left:${p.start/24*100}%;width:${(p.end-p.start)/24*100}%" title="${p.start}:00–${p.end}:00 · ${p.energyKwh} kWh">${String(p.start).padStart(2,'0')}:00 — ${String(p.end).padStart(2,'0')}:00</div></div></div>`).join('')}`;
}
$$('[data-schedule]').forEach(e=>e.onclick=()=>{scheduleMode=e.dataset.schedule;$$('[data-schedule]').forEach(b=>b.classList.toggle('selected',b===e));renderSchedule();});
function renderProviders(){
 const decision=p=>result?.decisions.find(d=>d.providerId===p.id);
 $('#provider-summary').innerHTML=config.providers.filter(p=>p.id!=='eurospot').map(p=>`<div class="provider-mini"><span class="provider-logo">${{prices:'ϟ',carbon:'♧',weather:'☀'}[p.kind]}</span><div>${escapeHtml(p.name)}<small>${escapeHtml(p.description.split(' · ')[0])}</small></div><span class="price">${fmt(p.priceMicros/1e6,3)} USDC</span><span class="provider-status ${decision(p)?.status==='purchased'?'purchased':''}">${escapeHtml(decision(p)?.status||'Available')}</span></div>`).join('');
 $('#marketplace').innerHTML=config.providers.map(p=>`<article class="card market-card"><div class="market-top"><span class="provider-logo">${{prices:'ϟ',carbon:'♧',weather:'☀'}[p.kind]}</span><div><h2>${escapeHtml(p.name)}</h2><small>${escapeHtml(p.description)}</small></div></div><div class="market-price">${fmt(p.priceMicros/1e6,3)} <small>USDC / call</small></div><p>${p.kind==='weather'?'Weather can be useful with thermal load models. The current fixed cooling model has no marginal use for this feed.':p.kind==='carbon'?'Shift operating hours away from carbon-intensive generation when a carbon price is included in the objective.':'Choose less expensive operating hours while meeting every load window and factory connection limit.'}</p><div class="market-details"><span>Quality estimate ${p.confidence}% · scenario metadata</span><span>HTTP 402 · ${config.mode==='demo'?'simulated':'HTS USDC'}</span></div><div class="market-decision">${escapeHtml(decision(p)?.reason||'Ready for agent discovery. All offered forecast data is synthetic in this prototype.')}</div></article>`).join('');
}
async function loadAudit(){try{
 const data=await api('/api/audit'); const anchored=data.events.filter(e=>e.hcs).length;
 $('#audit-summary').textContent=`${data.integrity.valid?'✓ Hash chain verified':'⚠ Integrity failure'} · ${data.events.length} events · ${anchored} HCS anchors · ${config.mode==='demo'?'Local simulation — no on-chain records':anchored===data.events.length?'All events anchored':'Some events are local or awaiting an HCS anchor'}`;
 $('#audit-events').innerHTML=data.events.length?[...data.events].reverse().map(e=>`<details class="audit-event"><summary><strong>${escapeHtml(e.type.replaceAll('.',' / '))}</strong><span class="audit-label">${e.hcs?'HCS ANCHORED':e.hcsError?'ANCHOR FAILED':'LOCAL'}</span><time>${new Date(e.time).toLocaleTimeString('en-GB')}</time></summary><pre>${escapeHtml(JSON.stringify(e,null,2))}</pre>${e.hcs?`<a target="_blank" rel="noreferrer" href="https://hashscan.io/testnet/topic/${encodeURIComponent(e.hcs.topicId)}">View topic on HashScan ↗</a>`:''}${e.detail.receipt?.transactionId?` <a target="_blank" rel="noreferrer" href="https://hashscan.io/testnet/transaction/${encodeURIComponent(e.detail.receipt.transactionId)}">View payment on HashScan ↗</a>`:''}</details>`).join(''):'<div class="empty-audit">Your first planning run starts the ledger.</div>';
}catch(e){message(e.message,true);}}
$('#refresh-audit').onclick=loadAudit;
$('#export').onclick=()=>{
 if(!result)return;
 const blob=new Blob([JSON.stringify({...result,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`gridagent-${result.runId}.json`;a.click();URL.revokeObjectURL(a.href);
};
(async()=>{try{config=await api('/api/config');renderInputs();renderProviders();if(config.mode==='testnet'){$('#network-badge').innerHTML='<i></i> Hedera testnet · real payments';$('#runtime-label').textContent='Hedera testnet';$('#mode-notice').textContent='Testnet mode · Payments use testnet USDC. Forecast data remains synthetic. Audit anchors are shown only after HCS consensus.';if(!config.readiness.payer||!config.readiness.merchant||!config.readiness.topic)message('Testnet setup is incomplete. Configure payer, merchant, and HCS topic before running.',true);} }catch(e){message('Unable to connect to GridAgent: '+e.message,true);$('#run').disabled=true;}})();
