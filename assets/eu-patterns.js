// Blue Ocean Ventures — EU Funding Patterns (Knowledge Hub, staff only).
// Visual, interactive view of where EU money goes and how it can be reached.
// Data: /data/eu-funding-statistics.json (official figures) + live EU calls from the nightly scan.
const D3='https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js';
const D3_SANKEY='https://cdn.jsdelivr.net/npm/d3-sankey@0.12.3/dist/d3-sankey.min.js';
const DATA_URL='/data/eu-funding-statistics.json';
const ROUTE_COLOR={open:'#2a78d6',national:'#eb6834',international:'#1baf7a',loans:'#eda100',government:'#e87ba4',other:'#a3a29c'};
const ROUTE_ORDER=['open','national','international','loans','government','other'];
const C={ink:'#17365c',ink2:'#52606f',muted:'#7a8796',grid:'#e6ebf1',surface:'#ffffff',series1:'#2a78d6',series2:'#eb6834',series3:'#1baf7a',series4:'#eda100',series5:'#e87ba4',series7:'#6250d6'};
const SEQ=['#cde2fb','#9ec5f4','#6da7ec','#3987e5','#256abf','#184f95','#0d366b'];
const fmtB=v=>v==null?'—':v>=1000?'€'+(v/1000).toFixed(2).replace(/\.?0+$/,'')+' tn':v>=100?'€'+Math.round(v)+' bn':v>=10?'€'+v.toFixed(1)+' bn':v>=1?'€'+v.toFixed(2)+' bn':'€'+Math.round(v*1000)+' m';

function loadScript(src){return new Promise((ok,fail)=>{if([...document.scripts].some(s=>s.src===src))return ok();const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>fail(Error('Could not load '+src));document.head.append(s)})}
async function loadD3(){if(!window.d3)await loadScript(D3);if(!window.d3.sankey)await loadScript(D3_SANKEY);return window.d3}

const CSS=`
#euPatterns{--ink:${C.ink};--ink2:${C.ink2};--muted:${C.muted};--grid:${C.grid};font-family:inherit;color:var(--ink)}
#euPatterns .ep-hero{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:4px 0 18px}
#euPatterns .ep-tile{background:#fff;border:1px solid #e3e9f1;border-radius:14px;padding:14px 16px;position:relative;overflow:hidden}
#euPatterns .ep-tile:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--a)}
#euPatterns .ep-tile b{display:block;font-size:30px;line-height:1.1;font-variant-numeric:tabular-nums;letter-spacing:-.5px}
#euPatterns .ep-tile span{display:block;font-size:12.5px;color:var(--ink2);margin-top:4px}
#euPatterns .ep-card{background:#fff;border:1px solid #e3e9f1;border-radius:16px;padding:18px 18px 14px;margin:0 0 18px}
#euPatterns .ep-card h3{margin:0;font-size:18px}
#euPatterns .ep-sub{margin:4px 0 10px;color:var(--ink2);font-size:13.5px}
#euPatterns .ep-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0 8px}
#euPatterns .ep-chip{border:1px solid #d5deea;background:#fff;border-radius:999px;padding:5px 11px;font:600 12.5px system-ui;color:var(--ink);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
#euPatterns .ep-chip i{width:10px;height:10px;border-radius:3px;display:inline-block}
#euPatterns .ep-chip[aria-pressed=true]{background:#17365c;color:#fff;border-color:#17365c}
#euPatterns .ep-chip.off{opacity:.4}
#euPatterns svg{display:block;width:100%;height:auto;overflow:visible}
#euPatterns svg text{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
#euPatterns .ep-two{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:18px}
#euPatterns .ep-detail{border-left:4px solid var(--a,#2a78d6);background:#f6f9fd;border-radius:10px;padding:12px 14px;min-height:90px;font-size:13.5px}
#euPatterns .ep-detail b{font-size:16px;display:block;margin-bottom:4px}
#euPatterns .ep-detail .big{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums}
#euPatterns .ep-note{font-size:12px;color:var(--muted);margin-top:6px}
#euPatterns details{font-size:13px;color:var(--ink2)}
#euPatterns details summary{cursor:pointer;font-weight:700;color:var(--ink)}
#euPatterns details a{color:#1767c9}
#euPatterns .ep-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--ink2)}
#euPatterns .ep-legend span{display:inline-flex;gap:6px;align-items:center}
#euPatterns .ep-legend i{width:12px;height:12px;border-radius:3px;display:inline-block}
#euPatterns .ep-comment{margin-top:14px;background:#f6f9fd;border:1px solid #dfe8f3;border-left:4px solid #17365c;border-radius:12px;padding:12px 16px;font-size:13.5px;line-height:1.5;color:#2c3f55}
#euPatterns .ep-comment h4{margin:0 0 6px;font-size:14px;color:#17365c}
#euPatterns .ep-comment p{margin:6px 0}
#euPatterns .ep-comment small{display:block;margin-top:8px;color:#7a8796}
#euPatterns .ep-comment small a{color:#1767c9}
#epTip{position:fixed;z-index:9999;pointer-events:none;background:#0f2742;color:#fff;border-radius:10px;padding:9px 11px;font:13px/1.4 system-ui;box-shadow:0 8px 24px rgba(15,39,66,.25);max-width:290px;opacity:0;transition:opacity .12s}
#epTip b{display:block;font-size:13.5px;margin-bottom:2px}
#epTip .r{display:flex;justify-content:space-between;gap:14px}
#epTip .r span:last-child{font-variant-numeric:tabular-nums;font-weight:700}
@media(max-width:820px){#euPatterns .ep-hero{grid-template-columns:repeat(2,minmax(0,1fr))}#euPatterns .ep-two{grid-template-columns:1fr}#euPatterns .ep-tile b{font-size:24px}}
`;

let tipEl=null;
function tip(html,ev){if(!tipEl){tipEl=document.createElement('div');tipEl.id='epTip';document.body.append(tipEl)}
 if(!html){tipEl.style.opacity=0;return}tipEl.innerHTML=html;tipEl.style.opacity=1;
 const w=tipEl.offsetWidth,h=tipEl.offsetHeight;let x=ev.clientX+14,y=ev.clientY+14;if(x+w>innerWidth-8)x=ev.clientX-w-14;if(y+h>innerHeight-8)y=ev.clientY-h-14;tipEl.style.left=x+'px';tipEl.style.top=y+'px'}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const row=(a,b)=>`<div class="r"><span>${esc(a)}</span><span>${esc(b)}</span></div>`;

function commentary(el,c){if(!c)return;el.querySelector('.ep-comment')?.remove();const b=document.createElement('div');b.className='ep-comment';
 b.innerHTML=`<h4>${esc(c.title)}</h4>${c.points.map(p=>`<p><strong>${esc(p.head)}.</strong> ${esc(p.text)}</p>`).join('')}${c.sources?.length?`<small>Sources: ${c.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</small>`:''}`;el.append(b)}
function card(root,title,sub){const c=document.createElement('section');c.className='ep-card';c.innerHTML=`<h3>${esc(title)}</h3>${sub?`<p class="ep-sub">${esc(sub)}</p>`:''}`;root.append(c);return c}
function widthOf(el){return Math.max(300,Math.min(1100,el.clientWidth-4))}

// ---------- 1. Budget trend ----------
function drawTrend(d3,el,data){
 el.querySelector('svg')?.remove();el.querySelector('.ep-comment')?.remove();
 const rows=data.annual_budgets.rows,W=widthOf(el),H=Math.round(Math.min(380,Math.max(280,W*.42))),m={t:W<560?50:26,r:W<560?16:110,b:30,l:44};
 const svg=d3.select(el).append('svg').attr('viewBox',`0 0 ${W} ${H}`).attr('role','img').attr('aria-label','EU annual budget 2010 to 2026, commitments and payments');
 const x=d3.scaleLinear().domain([2010,2026]).range([m.l,W-m.r]),y=d3.scaleLinear().domain([100,210]).range([H-m.b,m.t]);
 const bands=[{l:'2007–2013',a:2010,b:2013.5},{l:'2014–2020',a:2013.5,b:2020.5},{l:'2021–2027',a:2020.5,b:2026}];
 svg.append('g').selectAll('rect').data(bands).join('rect').attr('x',d=>x(d.a)).attr('width',d=>x(d.b)-x(d.a)).attr('y',m.t-18).attr('height',H-m.b-m.t+18).attr('fill',(d,i)=>i%2?'#f3f7fc':'#fafcfe');
 svg.append('g').selectAll('text').data(bands).join('text').attr('x',d=>(x(d.a)+x(d.b))/2).attr('y',m.t-6).attr('text-anchor','middle').attr('font-size',W<560?10:11.5).attr('font-weight',700).attr('fill',C.muted).text(d=>W<560?d.l.replace(/20(\d\d)/g,'$1'):d.l);
 const gy=svg.append('g');for(const v of y.ticks(5)){gy.append('line').attr('x1',m.l).attr('x2',W-m.r).attr('y1',y(v)).attr('y2',y(v)).attr('stroke',C.grid);gy.append('text').attr('x',m.l-8).attr('y',y(v)+4).attr('text-anchor','end').attr('font-size',11).attr('fill',C.muted).text('€'+v+'bn')}
 const xt=W<560?[2010,2014,2018,2022,2026]:d3.range(2010,2027,2);svg.append('g').selectAll('text').data(xt).join('text').attr('x',d=>x(d)).attr('y',H-m.b+18).attr('text-anchor','middle').attr('font-size',11).attr('fill',C.muted).text(d=>d);
 const area=d3.area().x(d=>x(d.year)).y0(d=>y(d.payments)).y1(d=>y(d.commitments)).curve(d3.curveMonotoneX);
 svg.append('path').datum(rows).attr('d',area).attr('fill',C.series1).attr('opacity',.08);
 const series=[{k:'commitments',c:C.series1,l:'Commitments'},{k:'payments',c:C.series2,l:'Payments'}];
 for(const s of series){
  const p=svg.append('path').datum(rows).attr('fill','none').attr('stroke',s.c).attr('stroke-width',2.5).attr('stroke-linecap','round').attr('d',d3.line().x(d=>x(d.year)).y(d=>y(d[s.k])).curve(d3.curveMonotoneX));
  const len=p.node().getTotalLength();p.attr('stroke-dasharray',len).attr('stroke-dashoffset',len).transition().duration(1400).ease(d3.easeCubicOut).attr('stroke-dashoffset',0);
  const last=rows[rows.length-1];
  if(m.r>60)svg.append('text').attr('x',x(2026)+8).attr('y',y(last[s.k])+(s.k==='payments'?12:-2)).attr('font-size',12.5).attr('font-weight',700).attr('fill',C.ink).text(s.l+' '+fmtB(last[s.k]));
 }
 const peak=rows.reduce((a,b)=>b.commitments>a.commitments?b:a);
 svg.append('circle').attr('cx',x(peak.year)).attr('cy',y(peak.commitments)).attr('r',5).attr('fill',C.series1).attr('stroke','#fff').attr('stroke-width',2);
 svg.append('text').attr('x',x(peak.year)-(W<560?14:0)).attr('y',y(peak.commitments)+(W<560?-8:-10)).attr('text-anchor',W<560?'end':'middle').attr('font-size',11.5).attr('font-weight',700).attr('fill',C.ink).text('Peak '+fmtB(peak.commitments));
 const dip=rows.find(r=>r.year===2024);svg.append('circle').attr('cx',x(2024)).attr('cy',y(dip.payments)).attr('r',5).attr('fill',C.series2).attr('stroke','#fff').attr('stroke-width',2);
 svg.append('text').attr('x',x(2024)).attr('y',y(dip.payments)+20).attr('text-anchor','middle').attr('font-size',11.5).attr('fill',C.ink2).text('2024 payment dip');
 if(m.r<=60){const lg=svg.append('g').attr('transform',`translate(${m.l},12)`);series.forEach((s,i)=>{lg.append('rect').attr('x',i*120).attr('y',-9).attr('width',12).attr('height',12).attr('rx',3).attr('fill',s.c);lg.append('text').attr('x',i*120+17).attr('y',1).attr('font-size',12).attr('fill',C.ink).text(s.l)})}
 const cross=svg.append('line').attr('y1',m.t).attr('y2',H-m.b).attr('stroke',C.ink).attr('stroke-dasharray','3 3').attr('opacity',0);
 const dots=series.map(s=>svg.append('circle').attr('r',5).attr('fill',s.c).attr('stroke','#fff').attr('stroke-width',2).attr('opacity',0));
 svg.append('rect').attr('x',m.l).attr('y',m.t).attr('width',W-m.l-m.r).attr('height',H-m.t-m.b).attr('fill','transparent')
  .on('pointermove',ev=>{const [px]=d3.pointer(ev);const yr=Math.round(x.invert(px));const r=rows.find(d=>d.year===yr);if(!r)return;cross.attr('x1',x(yr)).attr('x2',x(yr)).attr('opacity',.35);dots.forEach((d,i)=>d.attr('cx',x(yr)).attr('cy',y(r[series[i].k])).attr('opacity',1));
   tip(`<b>${yr} EU budget</b>${row('Commitments',fmtB(r.commitments))}${row('Payments',fmtB(r.payments))}${row('Gap',fmtB(r.commitments-r.payments))}`,ev)})
  .on('pointerleave',()=>{tip(null);cross.attr('opacity',0);dots.forEach(d=>d.attr('opacity',0))});
 commentary(el,data.annual_budgets.commentary);
}

// ---------- 2. Money flow (Sankey) ----------
function drawFlow(d3,el,data,state){
 el.querySelector('svg')?.remove();
 const mff=data.mff_2021_2027,W=widthOf(el),narrow=W<640,H=narrow?600:520;
 const nodes=[{id:'TOTAL',name:'2021–2027 budget + NextGenerationEU',kind:'total'}],links=[];
 for(const h of mff.headings)nodes.push({id:h.id,name:h.label,kind:'heading'});
 for(const r of ROUTE_ORDER)nodes.push({id:'R_'+r,name:data.routes[r].label,kind:'route',route:r});
 if(!narrow)for(const h of mff.headings)links.push({source:'TOTAL',target:h.id,value:h.mff+h.ngeu,kind:'in'});else nodes.shift();
 const agg=new Map();for(const f of mff.flows){const k=f.heading+'|'+f.route;const a=agg.get(k)||{source:f.heading,target:'R_'+f.route,value:0,route:f.route,items:[]};a.value+=f.value;a.items.push(f);agg.set(k,a)}
 links.push(...agg.values());
 const sankey=d3.sankey().nodeId(d=>d.id).nodeWidth(narrow?10:14).nodePadding(narrow?10:14).nodeSort(null).linkSort(null).extent([[narrow?Math.round(W*.36):24,8],[W-(narrow?104:300),H-6]]);
 const g=sankey({nodes:nodes.map(d=>({...d})),links:links.map(d=>({...d}))});
 const total=d3.sum(mff.headings,h=>h.mff+h.ngeu);
 const svg=d3.select(el).append('svg').attr('viewBox',`0 0 ${W} ${H}`).attr('role','img').attr('aria-label','Flow of the 2021-2027 EU budget into spending areas and access routes');
 const linkSel=svg.append('g').attr('fill','none').selectAll('path').data(g.links).join('path').attr('d',d3.sankeyLinkHorizontal())
  .attr('stroke',d=>d.kind==='in'?'#9fb6cf':ROUTE_COLOR[d.route]).attr('stroke-opacity',d=>d.kind==='in'?.35:.55).attr('stroke-width',d=>Math.max(1,d.width))
  .style('mix-blend-mode','multiply')
  .on('pointermove',(ev,d)=>{const pct=(d.value/total*100).toFixed(1);
   const items=(d.items||[]).sort((a,b)=>b.value-a.value).slice(0,6).map(i=>row(i.name,fmtB(i.value))).join('');
   tip(`<b>${esc(d.source.name)} → ${esc(d.target.name)}</b>${row('Amount',fmtB(d.value))}${row('Share of €2.02 tn',pct+'%')}${items}`,ev)})
  .on('pointerleave',()=>tip(null));
 const focus=r=>{linkSel.transition().duration(200).attr('stroke-opacity',d=>d.kind==='in'?(r?.12:.35):(!r||d.route===r?.6:.08))};
 state.focusRoute=focus;
 const nodeSel=svg.append('g').selectAll('g').data(g.nodes).join('g');
 nodeSel.append('rect').attr('x',d=>d.x0).attr('y',d=>d.y0).attr('width',d=>d.x1-d.x0).attr('height',d=>Math.max(1,d.y1-d.y0)).attr('rx',3)
  .attr('fill',d=>d.kind==='route'?ROUTE_COLOR[d.route]:d.kind==='total'?C.ink:'#5d7896')
  .style('cursor',d=>d.kind==='route'?'pointer':'default')
  .on('pointermove',(ev,d)=>tip(`<b>${esc(d.name)}</b>${row('Amount',fmtB(d.value))}${row('Share',(d.value/total*100).toFixed(1)+'%')}${d.kind==='route'?`<div style="margin-top:4px;opacity:.85">${esc(data.routes[d.route].hint)}</div>`:''}`,ev))
  .on('pointerleave',()=>tip(null))
  .on('click',(ev,d)=>{if(d.kind!=='route')return;state.activeRoute=state.activeRoute===d.route?null:d.route;focus(state.activeRoute);state.onRoute?.(state.activeRoute)});
 nodeSel.append('text').attr('x',d=>d.kind==='route'?d.x1+8:d.x0-8).attr('y',d=>(d.y0+d.y1)/2).attr('dy','0.35em').attr('text-anchor',d=>d.kind==='route'?'start':d.kind==='total'?'middle':'end').attr('transform',d=>d.kind==='total'?`rotate(-90 ${d.x0-8} ${(d.y0+d.y1)/2})`:null)
  .attr('font-size',d=>d.kind==='total'?13:narrow?11:12.5).attr('font-weight',d=>d.kind==='heading'?600:800).attr('fill',C.ink)
  .text(d=>{const v=fmtB(d.value);if(d.kind==='total')return '€2.02 tn total';const pc=(d.value/total<.01?'<1':Math.round(d.value/total*100))+'%';if(d.kind==='route')return narrow?data.routes[d.route].short+' '+pc:d.name+' · '+v+' ('+pc+')';return narrow?(d.name.length>17?d.name.split(/[,&]/)[0].trim().slice(0,17):d.name):d.name+(d.y1-d.y0>14?' · '+v:'')})
  .attr('paint-order','stroke').attr('stroke','#fff').attr('stroke-width',3).attr('stroke-linejoin','round');
}

// ---------- 3. Programme bubbles ----------
function drawBubbles(d3,el,data,state,live){
 el.querySelector('.ep-two')?.remove();
 const wrap=document.createElement('div');wrap.className='ep-two';el.append(wrap);
 const left=document.createElement('div'),right=document.createElement('div');wrap.append(left,right);
 const detail=document.createElement('div');detail.className='ep-detail';right.append(detail);
 const rows=data.programmes.rows.filter(r=>r.value);
 const byCode=new Map(rows.map(r=>[r.code,r]));
 const tops=rows.filter(r=>!r.parent||!byCode.has(r.parent));
 const kids=code=>rows.filter(r=>r.parent===code);
 const build=r=>{const ks=kids(r.code);if(!ks.length)return {...r,v:r.value};const rest=r.value-d3.sum(ks,k=>k.value);return {...r,children:[...ks.map(build),{name:'rest',rest:true,v:Math.max(rest,0.01),route:r.route,code:r.code+'_REST'}]}};
 const root=d3.hierarchy({name:'all',children:tops.map(build)}).sum(d=>d.children?0:Math.sqrt(d.v)).sort((a,b)=>b.value-a.value);
 const W=widthOf(left),S=Math.min(W,560);
 d3.pack().size([S,S]).padding(d=>d.depth===0?3:1.5)(root);
 const svg=d3.select(left).append('svg').attr('viewBox',`0 0 ${S} ${S}`).attr('role','img').attr('aria-label','47 EU programmes sized by budget');
 const nodes=root.descendants().filter(d=>d.depth>0&&!d.data.rest);
 const live_=live?.callsByProgramme||new Map();
 const show=d=>{const r=d.data,col=ROUTE_COLOR[r.route];detail.style.setProperty('--a',col);
  const n=live_.get(r.code);
  detail.innerHTML=`<b>${esc(r.name)}</b><div class="big">${fmtB(r.value)}</div><div>${esc(data.routes[r.route].label)}${r.parent?` · part of ${esc(byCode.get(r.parent)?.name||r.parent)}`:''}</div><div style="margin-top:6px">${n!=null?`<strong>${n}</strong> open or forthcoming EU call${n===1?'':'s'} in our scan now`:'Live call count appears when EU scan data is available'}</div>${r.outside_budget?'<div class="ep-note">Financed from the EU carbon market (ETS), outside the EU budget, 2020–2030.</div>':''}${r.note?`<div class="ep-note">${esc(r.note)}</div>`:''}<div class="ep-note">${esc(r.theme)}</div>`};
 const circles=svg.append('g').selectAll('circle').data(nodes).join('circle').attr('cx',d=>d.x).attr('cy',d=>d.y).attr('r',0)
  .attr('fill',d=>ROUTE_COLOR[d.data.route]).attr('fill-opacity',d=>d.children?.16:.88)
  .attr('stroke',d=>d.children?ROUTE_COLOR[d.data.route]:'#fff').attr('stroke-width',d=>d.children?2:1.2).attr('stroke-dasharray',d=>d.data.outside_budget?'4 3':null)
  .style('cursor','pointer')
  .on('pointermove',(ev,d)=>{const n=live_.get(d.data.code);tip(`<b>${esc(d.data.name)}</b>${row('2021–2027',fmtB(d.data.value))}${row('Access',data.routes[d.data.route].short)}${n!=null?row('Open calls now',n):''}`,ev)})
  .on('pointerleave',()=>tip(null)).on('click',(ev,d)=>{ev.stopPropagation();show(d)});
 circles.transition().duration(900).delay((d,i)=>i*12).attr('r',d=>d.r);
 const SHORT={HORIZON:'Horizon Europe',ERDF:'Regional Fund (ERDF)',INNOVFUND:'Innovation Fund',INVESTEU:'InvestEU',ERASMUS:'Erasmus+',MODF:'Modernisation',INTERREG:'Interreg',EAFRD:'Rural Dev.',EAGF:'CAP farm aid',ESF:'ESF+',NDICI:'Global Europe',RRF:'Recovery Facility'};
 const fit=(t,r)=>(2*r*.86)/(t.length*.62);
 const lab=d=>{const l=SHORT[d.data.code];return l&&(d.children||fit(l,d.r)>=8.5)?l:d.data.code};
 const fs=d=>d.children?Math.min(14,d.r/5):Math.min(15,fit(lab(d),d.r));
 svg.append('g').attr('pointer-events','none').selectAll('text').data(nodes.filter(d=>fs(d)>=8.5)).join('text')
  .attr('x',d=>d.x).attr('y',d=>d.children?d.y-d.r+fs(d)+6:d.y).attr('dy',d=>d.children?0:'0.35em').attr('text-anchor','middle')
  .attr('font-size',fs).attr('font-weight',800).attr('fill',d=>d.children?C.ink:'#fff').text(lab);
 state.bubbleFilter=r=>circles.transition().duration(250).attr('opacity',d=>!r||d.data.route===r?1:.15);
 const biggestOpen=rows.filter(r=>r.route==='open'&&!r.parent).sort((a,b)=>b.value-a.value)[0];
 const first=nodes.find(n=>n.data.code===biggestOpen.code);if(first)show(first);
 const lg=document.createElement('div');lg.className='ep-legend';lg.style.marginTop='12px';lg.innerHTML=ROUTE_ORDER.filter(r=>r!=='other').map(r=>`<span><i style="background:${ROUTE_COLOR[r]}"></i>${esc(data.routes[r].short)}</span>`).join('')+'<span><i style="background:#fff;border:1.5px dashed #2a78d6"></i>Outside EU budget</span>';
 right.append(lg);
 const note=document.createElement('div');note.className='ep-note';note.textContent='Bubble area grows with the square root of the budget so small programmes stay visible. Circles inside circles are parts of a larger programme.';right.append(note);
}

// ---------- 4. Europe tile map ----------
function drawTiles(d3,el,data,state,live){
 el.querySelector('.ep-map')?.remove();
 const box=document.createElement('div');box.className='ep-map';el.append(box);
 const c=data.countries,metric=state.mapMetric||'total';
 const val=k=>{const r=c.rows[k];if(metric==='calls')return live?.callsByCountry?.get(k)??0;if(metric==='cohesion')return r.cohesion/1000;if(metric==='rrf')return r.rrf;return r.cohesion/1000+r.rrf};
 const unit=metric==='calls'?(v=>v+' calls'):fmtB;
 const vals=c.grid.map(([k])=>val(k)),max=d3.max(vals)||1;
 const color=d3.scaleQuantile().domain(vals).range(SEQ);
 const W=widthOf(box),cols=7,rows=7,gap=6,cell=Math.min(64,(Math.min(W,620)-gap*(cols-1))/cols),SW=cols*cell+(cols-1)*gap,SH=rows*cell+(rows-1)*gap;
 const svg=d3.select(box).append('svg').attr('viewBox',`0 0 ${SW} ${SH}`).style('max-width',SW+'px').style('margin','0 auto').attr('role','img').attr('aria-label','EU Member States tile map');
 const t=svg.selectAll('g').data(c.grid).join('g').attr('transform',([k,x,y])=>`translate(${x*(cell+gap)},${y*(cell+gap)})`).style('cursor','default');
 t.append('rect').attr('width',cell).attr('height',cell).attr('rx',10).attr('fill','#eef2f7').transition().duration(700).delay((d,i)=>i*18).attr('fill',([k])=>color(val(k)));
 const dark=k=>SEQ.indexOf(color(val(k)))>=3;
 t.append('text').attr('x',8).attr('y',18).attr('font-size',Math.max(10,cell*.2)).attr('font-weight',800).attr('fill',([k])=>dark(k)?'#fff':C.ink).text(([k])=>k);
 t.append('text').attr('x',8).attr('y',cell-9).attr('font-size',Math.max(8.5,cell*.16)).attr('font-weight',600).attr('fill',([k])=>dark(k)?'#fff':C.ink2)
  .text(([k])=>{const v=val(k);return metric==='calls'?v:v>=10?Math.round(v)+'bn':v.toFixed(1)+'bn'});
 t.on('pointermove',(ev,[k])=>{const r=c.rows[k];tip(`<b>${esc(r.name)}</b>${row('Cohesion 2021–27',fmtB(r.cohesion/1000))}${row('Recovery grants',fmtB(r.rrf))}${row('Combined',fmtB(r.cohesion/1000+r.rrf))}${live?.callsByCountry?row('Open calls naming it',live.callsByCountry.get(k)||0):''}`,ev)}).on('pointerleave',()=>tip(null));
 const lg=document.createElement('div');lg.className='ep-legend';lg.style.cssText='justify-content:center;margin-top:10px';
 lg.innerHTML=`<span>Lowest</span>${SEQ.map(s=>`<i style="background:${s};width:22px;border-radius:2px"></i>`).join('')}<span>Highest · top ${unit(metric==='calls'?max:+max.toFixed(1))}</span>`;
 box.append(lg);
 if(metric==='calls'&&live?.callsAbroad){const n=document.createElement('div');n.className='ep-note';n.style.textAlign='center';n.textContent=`Plus ${live.callsAbroad} open calls that name countries outside the EU (e.g. Africa, neighbourhood). Most EU calls name no single country.`;box.append(n)}
}

// ---------- 5. Opportunity gap (live) ----------
function drawGap(d3,el,data,live){
 el.querySelector('svg')?.remove();el.querySelector('.ep-note')?.remove();
 if(!live?.areaStats?.length){const n=document.createElement('p');n.className='ep-note';n.textContent=live?.error?'Live EU call data is not available right now: '+live.error:'Loading live EU calls…';el.append(n);return}
 const pts=live.areaStats.filter(a=>a.budget>0),W=widthOf(el),H=Math.round(Math.min(440,Math.max(320,W*.5))),m={t:20,r:20,b:44,l:52};
 const x=d3.scaleLog().domain([d3.min(pts,d=>d.budget)*.7,d3.max(pts,d=>d.budget)*1.4]).range([m.l,W-m.r]);
 const y=d3.scaleLinear().domain([0,d3.max(pts,d=>d.calls)*1.15||1]).nice().range([H-m.b,m.t]);
 const r=d3.scaleSqrt().domain([0,d3.max(pts,d=>d.money)||1]).range([6,26]);
 const mx=d3.median(pts,d=>d.budget),my=d3.median(pts,d=>d.calls);
 const svg=d3.select(el).append('svg').attr('viewBox',`0 0 ${W} ${H}`).attr('role','img').attr('aria-label','Project areas: EU budget behind them versus open calls now');
 const nq=W<560,q=[[m.l,m.t,x(mx),y(my),nq?'Busy':'Many calls, smaller budget'],[x(mx),m.t,W-m.r,y(my),nq?'Big & busy':'Big budget, many calls'],[m.l,y(my),x(mx),H-m.b,nq?'Quiet':'Few calls, small budget'],[x(mx),y(my),W-m.r,H-m.b,nq?'Big, few calls':'Big budget, few direct calls']];
 svg.append('g').selectAll('rect').data(q).join('rect').attr('x',d=>d[0]).attr('y',d=>d[1]).attr('width',d=>d[2]-d[0]).attr('height',d=>d[3]-d[1]).attr('fill',(d,i)=>['#f7f9fc','#eef4fb','#fbfbfa','#fff5ef'][i]);
 svg.append('g').selectAll('text').data(q).join('text').attr('x',(d,i)=>i%2?d[2]-8:d[0]+8).attr('y',(d,i)=>i<2?d[1]+16:d[3]-8).attr('text-anchor',(d,i)=>i%2?'end':'start').attr('font-size',11.5).attr('font-weight',700).attr('fill',(d,i)=>i===3?'#b4541f':C.muted).text(d=>d[4]);
 for(const v of y.ticks(5)){svg.append('text').attr('x',m.l-8).attr('y',y(v)+4).attr('text-anchor','end').attr('font-size',11).attr('fill',C.muted).text(v)}
 for(const v of x.ticks(5).filter(v=>(W<560?[1]:[1,2,5]).includes(+String(v)[0]))){svg.append('text').attr('x',x(v)).attr('y',H-m.b+16).attr('text-anchor','middle').attr('font-size',11).attr('fill',C.muted).text(fmtB(v))}
 svg.append('text').attr('x',(m.l+W-m.r)/2).attr('y',H-6).attr('text-anchor','middle').attr('font-size',12).attr('fill',C.ink2).text(W<560?'Programme budget (log) →':'2021–2027 EU programme budget behind the area (log scale) →');
 svg.append('text').attr('transform',`translate(14,${(m.t+H-m.b)/2}) rotate(-90)`).attr('text-anchor','middle').attr('font-size',12).attr('fill',C.ink2).text(W<560?'Open calls now →':'Open & forthcoming EU calls now →');
 const sim=d3.forceSimulation(pts.map(p=>({...p,x0:x(p.budget),y0:y(p.calls),x:x(p.budget),y:y(p.calls)}))).force('x',d3.forceX(d=>d.x0).strength(.9)).force('y',d3.forceY(d=>d.y0).strength(.9)).force('c',d3.forceCollide(d=>r(d.money)+1.5)).stop();
 for(let i=0;i<160;i++)sim.tick();
 const ns=sim.nodes();
 const gg=svg.append('g').selectAll('g').data(ns).join('g').attr('transform',d=>`translate(${d.x},${d.y})`).style('cursor','default');
 gg.append('circle').attr('r',0).attr('fill',d=>d.x0>x(mx)&&d.y0>y(my)?C.series2:C.series1).attr('fill-opacity',.85).attr('stroke','#fff').attr('stroke-width',1.5).transition().duration(800).attr('r',d=>r(d.money));
 const boxes=[];for(const d of [...ns].sort((a,b)=>b.calls-a.calls||a.x-b.x)){const w=d.area.length*6.9,h=14,rr=r(d.money)+4;const tries=[[d.x+rr,d.y-h/2,'start',rr,0],[d.x-rr-w,d.y-h/2,'end',-rr,0],[d.x-w/2,d.y-rr-h,'middle',0,-rr-6],[d.x-w/2,d.y+rr,'middle',0,rr+8]];
  const hit=b=>boxes.some(o=>b[0]<o[0]+o[2]&&b[0]+b[2]>o[0]&&b[1]<o[1]+o[3]&&b[1]+b[3]>o[1])||ns.some(o=>o!==d&&b[0]<o.x+r(o.money)&&b[0]+b[2]>o.x-r(o.money)&&b[1]<o.y+r(o.money)&&b[1]+b[3]>o.y-r(o.money))||b[0]<m.l||b[0]+b[2]>W-m.r+10;
  let pick=tries[0];for(const t of tries){const b=[t[0],t[1],w,h];if(!hit(b)){pick=t;break}}boxes.push([pick[0],pick[1],w,h]);d.lab=pick}
 gg.append('text').attr('x',d=>d.lab[3]).attr('y',d=>d.lab[4]).attr('text-anchor',d=>d.lab[2]).attr('dy','0.35em').attr('font-size',11.5).attr('font-weight',600).attr('fill',C.ink).attr('paint-order','stroke').attr('stroke','#fff').attr('stroke-width',3).text(d=>d.area.replace(' and ',' & '));
 gg.on('pointermove',(ev,d)=>tip(`<b>${esc(d.area)}</b>${row('EU programme budget',fmtB(d.budget))}${row('Open/forthcoming calls',d.calls)}${row('Money in those calls',d.money?fmtB(d.money/1000):'not stated')}${d.top?`<div style="margin-top:4px;opacity:.85">Main programmes: ${esc(d.top)}</div>`:''}`,ev)).on('pointerleave',()=>tip(null));
 const n=document.createElement('p');n.className='ep-note';n.textContent=`Live from our nightly scan of the EU Funding & Tenders Portal (${live.callCount} open or forthcoming calls). Bubble size = money stated in those calls. Orange = big budget but few direct calls: money there mostly flows through national or regional authorities, so look for national calls too.`;el.append(n);
}

// ---------- 6. Who wins (slope) ----------
function drawSlope(d3,el,data){
 el.querySelector('svg')?.remove();
 const rows=data.horizon_winners.rows,W=widthOf(el),H=300,m={t:34,b:20,l:W<560?118:250,r:W<560?96:130};
 const dodge=k=>{const o=rows.map((r,i)=>({i,y:0,v:r[k]})).sort((a,b)=>b.v-a.v);let prev=-1e9;const out=[];for(const p of o){let yy=y(p.v);if(yy-prev<17)yy=prev+17;prev=yy;out[p.i]=yy}return out};
 const y=d3.scaleLinear().domain([5,42]).range([H-m.b,m.t]),xa=m.l,xb=W-m.r,cols=[C.series1,C.series3,C.series7,C.series4];
 const ya=dodge('h2020'),yb=dodge('he');
 const svg=d3.select(el).append('svg').attr('viewBox',`0 0 ${W} ${H}`).attr('role','img').attr('aria-label','Share of Horizon grant funding by organisation type');
 svg.append('text').attr('x',xa).attr('y',16).attr('text-anchor','middle').attr('font-size',12.5).attr('font-weight',800).attr('fill',C.ink).text(W<560?'2014–20':'Horizon 2020');
 svg.append('text').attr('x',xb).attr('y',16).attr('text-anchor','middle').attr('font-size',12.5).attr('font-weight',800).attr('fill',C.ink).text(W<560?'2021–24':'Horizon Europe');
 svg.append('line').attr('x1',xa).attr('x2',xa).attr('y1',m.t-8).attr('y2',H-m.b).attr('stroke',C.grid).attr('stroke-width',2);
 svg.append('line').attr('x1',xb).attr('x2',xb).attr('y1',m.t-8).attr('y2',H-m.b).attr('stroke',C.grid).attr('stroke-width',2);
 rows.forEach((r,i)=>{const g=svg.append('g');
  const ln=g.append('line').attr('x1',xa).attr('y1',y(r.h2020)).attr('x2',xa).attr('y2',y(r.h2020)).attr('stroke',cols[i]).attr('stroke-width',3).attr('stroke-linecap','round');
  ln.transition().duration(1000).delay(i*120).attr('x2',xb).attr('y2',y(r.he));
  g.append('circle').attr('cx',xa).attr('cy',y(r.h2020)).attr('r',6).attr('fill',cols[i]).attr('stroke','#fff').attr('stroke-width',2);
  g.append('circle').attr('cx',xb).attr('cy',y(r.he)).attr('r',6).attr('fill',cols[i]).attr('stroke','#fff').attr('stroke-width',2);
  const short=W<560?r.type.split(/[ (]/)[0]:r.type;
  g.append('text').attr('x',xa-12).attr('y',ya[i]).attr('dy','0.35em').attr('text-anchor','end').attr('font-size',12).attr('fill',C.ink).text(`${short} ${r.h2020}%`);
  const d=(r.he-r.h2020).toFixed(1);g.append('text').attr('x',xb+12).attr('y',yb[i]).attr('dy','0.35em').attr('font-size',12).attr('font-weight',700).attr('fill',cols[i]).text(`${r.he}%  ${d>0?'▲ +'+d:'▼ '+d}`);
  g.style('cursor','default').on('pointermove',ev=>tip(`<b>${esc(r.type)}</b>${row('Horizon 2020',r.h2020+'%')}${row('Horizon Europe 2021–24',r.he+'%')}`,ev)).on('pointerleave',()=>tip(null));
 });
}

// ---------- 7. Next budget ----------
function drawFuture(d3,el,data){
 el.querySelector('svg')?.remove();
 const bars=data.future.bars,W=widthOf(el),nar=W<560,H=bars.length*(nar?92:74)+40,m={l:nar?4:150,r:24,t:nar?22:10};
 const x=d3.scaleLinear().domain([0,2100]).range([m.l,W-m.r]),cols=[[C.series1,'#9ec5f4'],[C.series2,C.series3,C.series7,'#c9c8c1']];
 const svg=d3.select(el).append('svg').attr('viewBox',`0 0 ${W} ${H}`).attr('role','img').attr('aria-label','2021-2027 versus 2028-2034 proposal');
 bars.forEach((b,i)=>{let acc=0;const yy=m.t+i*(nar?92:74);const tot=d3.sum(b.parts,p=>p.value);
  if(nar)svg.append('text').attr('x',m.l).attr('y',yy-4).attr('font-size',12.5).attr('font-weight',800).attr('fill',C.ink).text(b.label+' · '+fmtB(tot));
  else{svg.append('text').attr('x',m.l-10).attr('y',yy+22).attr('text-anchor','end').attr('font-size',12.5).attr('font-weight',800).attr('fill',C.ink).text(b.label);svg.append('text').attr('x',m.l-10).attr('y',yy+38).attr('text-anchor','end').attr('font-size',12).attr('fill',C.ink2).text(fmtB(tot))}
  b.parts.forEach((p,j)=>{const x0=x(acc);acc+=p.value;const rct=svg.append('rect').attr('x',x0).attr('y',yy+6).attr('height',38).attr('width',0).attr('fill',cols[i][j]).attr('rx',j===b.parts.length-1?6:0);
   rct.transition().duration(900).delay(j*150).attr('width',Math.max(0,x(acc)-x0-2));
   if(x(acc)-x0>70)svg.append('text').attr('x',x0+8).attr('y',yy+30).attr('font-size',11.5).attr('font-weight',700).attr('fill',j===3&&i===1?C.ink:'#fff').attr('pointer-events','none').text(fmtB(p.value));
   rct.on('pointermove',ev=>tip(`<b>${esc(p.name)}</b>${row(b.label,fmtB(p.value))}`,ev)).on('pointerleave',()=>tip(null))})});
 const lg=document.createElement('div');lg.className='ep-legend';lg.style.marginTop='4px';lg.innerHTML=bars.flatMap((b,i)=>b.parts.map((p,j)=>`<span><i style="background:${cols[i][j]}"></i>${esc(p.name)}</span>`)).join('');
 el.querySelector('.ep-legend')?.remove();el.querySelector('.ep-mff')?.remove();el.append(lg);
 const nt=document.createElement('p');nt.className='ep-note ep-mff';nt.style.cssText='margin-top:12px;font-size:13px;color:#52606f;border-top:1px solid #e6ebf1;padding-top:10px';
 nt.innerHTML='<strong>MFF = Multiannual Financial Framework</strong>: the EU\'s long-term budget, agreed for seven years at a time. It sets the maximum the EU can spend each year in each area; the yearly EU budgets are agreed within these limits. <strong>NextGenerationEU</strong> is a temporary recovery fund (2021–2026), financed by EU borrowing, added on top after COVID-19.';
 el.append(nt);
}

// ---------- Live data from the nightly scan ----------
async function buildLive(hub,data){
 const out={};
 try{
  const eu=await hub.loadEU();
  const calls=eu?.calls||[],progs=eu?.programmes||[];
  out.callCount=calls.length;
  out.callsByProgramme=new Map();for(const c of calls){const code=c.req?.programme_code||c.prog?.code;if(code)out.callsByProgramme.set(code,(out.callsByProgramme.get(code)||0)+1)}
  for(const p of data.programmes.rows)if(!out.callsByProgramme.has(p.code))out.callsByProgramme.set(p.code,0);
  out.callsByCountry=new Map();let abroad=0;const eu27=new Set(Object.keys(data.countries.rows));
  for(const c of calls){const cc=[...new Set([...(c.country_codes||[]),...(c.req?.eligible_countries||[])].map(v=>String(v).toUpperCase()))];
   let outside=false;for(const k of cc){if(k==='EL'){out.callsByCountry.set('GR',(out.callsByCountry.get('GR')||0)+1);continue}if(eu27.has(k))out.callsByCountry.set(k,(out.callsByCountry.get(k)||0)+1);else outside=true}if(outside)abroad++}
  out.callsAbroad=abroad;
  const env=new Map(data.programmes.rows.filter(r=>r.value&&!r.parent).map(r=>[r.code,r.value]));
  const stats=new Map(hub.areas.map(a=>[a,{area:a,budget:0,calls:0,money:0,progs:[]}]));
  for(const p of progs){const v=env.get(p.code);const ar=(p._areas||[]).filter(a=>stats.has(a));if(!v||!ar.length)continue;for(const a of ar){const s=stats.get(a);s.budget+=v/ar.length;s.progs.push([p.name,v/ar.length])}}
  for(const c of calls){for(const a of c._areas||[]){const s=stats.get(a);if(!s)continue;s.calls++;const mny=c.total_budget_eur||c.funding_max_eur||c.req?.grant_max||0;s.money+=mny/1e6}}
  out.areaStats=[...stats.values()].map(s=>({...s,top:s.progs.sort((a,b)=>b[1]-a[1]).slice(0,3).map(p=>p[0]).join(', ')}));
 }catch(e){out.error=e.message||String(e)}
 return out;
}

export async function mount(root,hub){
 if(root.dataset.ready)return;root.dataset.ready='1';
 const st=document.createElement('style');st.textContent=CSS;document.head.append(st);
 root.innerHTML='<p class="ep-sub">Loading charts…</p>';
 let d3,data;
 try{[d3,data]=await Promise.all([loadD3(),fetch(DATA_URL,{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('data file '+r.status);return r.json()})])}
 catch(e){root.innerHTML='<p class="ep-sub">Charts could not load: '+esc(e.message)+'</p>';delete root.dataset.ready;return}
 root.innerHTML='';
 const state={};
 const mff=data.mff_2021_2027,total=d3.sum(mff.headings,h=>h.mff+h.ngeu);
 const byRoute=d3.rollup(mff.flows,v=>d3.sum(v,f=>f.value),f=>f.route);
 const last=data.annual_budgets.rows.at(-1);
 const hero=document.createElement('div');hero.className='ep-hero';
 hero.innerHTML=[
  [fmtB(last.commitments),'EU budget '+last.year+' (commitments)',C.ink],
  ['€2.02 tn','2021–2027 budget + NextGenerationEU',C.series7],
  [Math.round(byRoute.get('open')/total*100)+'%','reachable through open EU calls',ROUTE_COLOR.open],
  [Math.round(byRoute.get('national')/total*100)+'%','through national & regional authorities',ROUTE_COLOR.national]
 ].map(([b,s,a])=>`<div class="ep-tile" style="--a:${a}"><b>${b}</b><span>${esc(s)}</span></div>`).join('');
 root.append(hero);
 const cTrend=card(root,'The EU budget, year by year','Adopted annual budgets 2010–2026. Hover any year.');
 const cFlow=card(root,'Where the €2 trillion goes — and how you can reach it','2021–2027 long-term budget plus NextGenerationEU, from spending area to access route. Click a route to highlight it.');
 const chips=document.createElement('div');chips.className='ep-row';cFlow.insertBefore(chips,cFlow.children[2]||null);
 const routesForChips=ROUTE_ORDER.filter(r=>r!=='other');
 chips.innerHTML='<button class="ep-chip" type="button" data-r="" aria-pressed="true">All routes</button>'+routesForChips.map(r=>`<button class="ep-chip" type="button" data-r="${r}" aria-pressed="false"><i style="background:${ROUTE_COLOR[r]}"></i>${esc(data.routes[r].short)}</button>`).join('');
 const setRoute=r=>{state.activeRoute=r||null;for(const b of chips.querySelectorAll('button'))b.setAttribute('aria-pressed',String((b.dataset.r||null)===state.activeRoute));state.focusRoute?.(state.activeRoute);state.bubbleFilter?.(state.activeRoute)};
 chips.onclick=e=>{const b=e.target.closest('button');if(b)setRoute(b.dataset.r)};state.onRoute=r=>setRoute(r);
 const flowBox=document.createElement('div');cFlow.append(flowBox);
 const cBub=card(root,'All 47 programmes at a glance','Bubble size = 2021–2027 budget, colour = who can apply. Click a bubble. The route buttons above filter it too.');
 const cMap=card(root,'Where the money lands in Europe','Cohesion policy and Recovery Facility grants per Member State, 2021–2027. Switch to live open calls.');
 const mchips=document.createElement('div');mchips.className='ep-row';cMap.append(mchips);
 const metrics=[['total','Cohesion + Recovery'],['cohesion','Cohesion policy'],['rrf','Recovery grants'],['calls','Open calls now (live)']];
 mchips.innerHTML=metrics.map(([k,l],i)=>`<button class="ep-chip" type="button" data-m="${k}" aria-pressed="${i===0}">${esc(l)}</button>`).join('');
 const cGap=card(root,'Opportunity gap by project area','EU programme budget behind each project area against the number of EU calls open right now.');
 const cSlope=card(root,'Who wins EU research grants','Share of Horizon grant money by type of organisation. Research bodies and public bodies are gaining.');
 const cFut=card(root,'What comes next: 2028–2034','The Commission\'s July 2025 proposal (under negotiation) against today\'s package.');
 const foot=document.createElement('section');foot.className='ep-card';
 foot.innerHTML=`<details><summary>Sources & data notes</summary>
  <p>${esc(data.annual_budgets.description)}</p><p>${esc(mff.description)}</p><p>${esc(data.programmes.description)}</p><p>${esc(data.future.description)}</p>
  <p><strong>Check of the baseline research:</strong> ${data.baseline_check.rows.map(r=>`${r.year}: baseline €${r.baseline}bn vs official adopted €${r.official}bn (${esc(r.note)})`).join(' · ')}. All other years match.</p>
  <p>Data file version ${esc(data.version)}. Figures are budgets and allocations, not grants actually awarded, and parent programmes and their components must never be added together.</p>
  <ul>${data.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ul></details>`;
 root.append(foot);
 let live=null;
 const render=()=>{drawTrend(d3,cTrend,data);drawFlow(d3,flowBox,data,state);drawBubbles(d3,cBub,data,state,live);drawTiles(d3,cMap,data,state,live);drawGap(d3,cGap,data,live);drawSlope(d3,cSlope,data);drawFuture(d3,cFut,data);if(state.activeRoute)setRoute(state.activeRoute)};
 mchips.onclick=e=>{const b=e.target.closest('button');if(!b)return;state.mapMetric=b.dataset.m;for(const x of mchips.querySelectorAll('button'))x.setAttribute('aria-pressed',String(x===b));drawTiles(d3,cMap,data,state,live)};
 render();
 let t,lastW=root.clientWidth;new ResizeObserver(()=>{const w=root.clientWidth;if(Math.abs(w-lastW)<8)return;lastW=w;clearTimeout(t);t=setTimeout(render,200)}).observe(root);
 if(hub?.loadEU){live=await buildLive(hub,data);drawBubbles(d3,cBub,data,state,live);drawTiles(d3,cMap,data,state,live);drawGap(d3,cGap,data,live);if(state.activeRoute)setRoute(state.activeRoute)}
 else drawGap(d3,cGap,data,{error:'not signed in'});
}
