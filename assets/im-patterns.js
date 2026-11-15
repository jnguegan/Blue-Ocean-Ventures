// Blue Ocean Ventures — Investment Migration patterns (Knowledge Hub, staff only).
// Visual view of citizenship and residence by investment programmes worldwide.
// Data: /data/investment-migration-2026.json (researched and source-linked, 15 Nov 2026).
const D3='https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js';
const D3_SANKEY='https://cdn.jsdelivr.net/npm/d3-sankey@0.12.3/dist/d3-sankey.min.js';
const DATA_URL='/data/investment-migration-2026.json';
const C={ink:'#17365c',ink2:'#52606f',muted:'#7a8796',grid:'#e6ebf1',closed:'#d03b3b',amber:'#eda100'};
const BUY_ORDER=['citizenship','permanent','residence'];
// World tile map: [column,row] per ISO3 code, laid out like a world map.
const TILE={CAN:[2,1],USA:[2,2],CRI:[2,5],PAN:[3,5],DOM:[4,4],KNA:[5,4],ATG:[6,4],DMA:[6,5],VCT:[5,6],LCA:[6,6],GRD:[6,7],BRA:[5,9],PRY:[4,10],ARG:[4,11],
 IRL:[8,1],GBR:[9,1],LVA:[12,1],HUN:[11,2],PRT:[8,3],ESP:[9,3],ITA:[10,3],GRC:[11,3],TUR:[12,3],MLT:[10,4],CYP:[11,4],
 SLE:[8,6],STP:[10,7],EGY:[11,5],MUS:[13,9],JOR:[12,5],KWT:[13,4],SAU:[13,5],BHR:[14,4],QAT:[14,5],ARE:[15,5],OMN:[15,6],
 HKG:[18,4],THA:[16,5],KHM:[17,5],PHL:[19,5],MYS:[16,6],SGP:[17,7],IDN:[18,7],AUS:[18,10],NRU:[21,6],VUT:[21,8],NZL:[21,11]};
const REGIONS=[['AMERICAS',2,0],['CARIBBEAN',5,3],['EUROPE',10,0],['AFRICA',9,5],['GULF',14,3],['ASIA',17,3],['PACIFIC',21,5]];
const fmtUSD=v=>v==null?'—':v>=1e6?'US$'+(v/1e6).toFixed(v>=1e7?0:1).replace(/\.0$/,'')+'m':'US$'+Math.round(v/1000)+'k';
const fmtLocal=p=>p.amount==null?'No fixed amount':(p.currency==='USD'?'US$':p.currency==='EUR'?'€':p.currency+' ')+p.amount.toLocaleString('en');

function loadScript(src){return new Promise((ok,fail)=>{if([...document.scripts].some(s=>s.src===src))return ok();const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>fail(Error('Could not load '+src));document.head.append(s)})}
async function loadD3(){if(!window.d3)await loadScript(D3);if(!window.d3.sankey)await loadScript(D3_SANKEY);return window.d3}

const CSS=`
#imPatterns{--ink:${C.ink};--ink2:${C.ink2};--muted:${C.muted};font-family:inherit;color:var(--ink)}
#imPatterns .im-hero{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:4px 0 14px}
#imPatterns .im-tile{background:#fff;border:1px solid #e3e9f1;border-radius:14px;padding:14px 16px;position:relative;overflow:hidden}
#imPatterns .im-tile:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--a)}
#imPatterns .im-tile b{display:block;font-size:30px;line-height:1.1;font-variant-numeric:tabular-nums;letter-spacing:-.5px}
#imPatterns .im-tile span{display:block;font-size:12.5px;color:var(--ink2);margin-top:4px}
#imPatterns .im-gloss{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 18px}
#imPatterns .im-gloss div{background:#f6f9fd;border:1px solid #dfe8f3;border-radius:12px;padding:10px 12px;font-size:12.5px;line-height:1.45;color:#2c3f55}
#imPatterns .im-gloss b{display:block;font-size:14px;color:var(--ink)}
#imPatterns .im-gloss em{font-style:normal;color:var(--muted);font-size:11.5px}
#imPatterns .im-card{background:#fff;border:1px solid #e3e9f1;border-radius:16px;padding:18px 18px 14px;margin:0 0 18px}
#imPatterns .im-card h3{margin:0;font-size:18px}
#imPatterns .im-sub{margin:4px 0 10px;color:var(--ink2);font-size:13.5px}
#imPatterns .im-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0 8px}
#imPatterns .im-chip{border:1px solid #d5deea;background:#fff;border-radius:999px;padding:5px 11px;font:600 12.5px system-ui;color:var(--ink);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
#imPatterns .im-chip i{width:10px;height:10px;border-radius:3px;display:inline-block}
#imPatterns .im-chip[aria-pressed=true]{background:#17365c;color:#fff;border-color:#17365c}
#imPatterns svg{display:block;width:100%;height:auto;overflow:visible}
#imPatterns svg text{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
#imPatterns .im-two{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:18px;align-items:start}
#imPatterns .im-half{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:start}
#imPatterns .im-mini{font-size:13px;font-weight:700;color:var(--ink);margin:0 0 6px}
#imPatterns .im-detail{border-left:4px solid var(--a,#2a78d6);background:#f6f9fd;border-radius:10px;padding:12px 14px;font-size:13.5px;line-height:1.45}
#imPatterns .im-detail h4{margin:0 0 2px;font-size:17px}
#imPatterns .im-detail .p{border-top:1px solid #dfe8f3;padding-top:9px;margin-top:9px}
#imPatterns .im-detail .p:first-of-type{border-top:0;margin-top:4px;padding-top:0}
#imPatterns .im-detail .big{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
#imPatterns .im-detail .tag{display:inline-block;border-radius:999px;padding:2px 8px;font-size:11.5px;font-weight:700;color:#fff;margin-right:4px}
#imPatterns .im-detail .chg{font-size:12px;color:#8a5a00;background:#fff6e0;border-radius:6px;padding:4px 7px;margin-top:6px}
#imPatterns .im-detail a{color:#1767c9;font-weight:600}
#imPatterns .im-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--ink2);margin:6px 0}
#imPatterns .im-legend span{display:inline-flex;gap:6px;align-items:center}
#imPatterns .im-legend i{width:12px;height:12px;border-radius:3px;display:inline-block}
#imPatterns .im-comment{margin-top:14px;background:#f6f9fd;border:1px solid #dfe8f3;border-left:4px solid #17365c;border-radius:12px;padding:12px 16px;font-size:13.5px;line-height:1.5;color:#2c3f55}
#imPatterns .im-comment h4{margin:0 0 6px;font-size:14px;color:#17365c}
#imPatterns .im-comment p{margin:6px 0}
#imPatterns .im-comment small{display:block;margin-top:8px;color:#7a8796}
#imPatterns .im-comment small a{color:#1767c9}
#imPatterns .im-tl{position:relative;display:grid;grid-template-columns:1fr 64px 1fr;row-gap:8px;margin:8px 0 4px}
#imPatterns .im-tl:before{content:"";position:absolute;left:50%;top:0;bottom:0;width:2px;margin-left:-1px;background:#d5deea}
#imPatterns .im-tl .y{grid-column:2;text-align:center;font-weight:800;font-size:13px;font-variant-numeric:tabular-nums;z-index:1}
#imPatterns .im-tl .y span{background:#fff;padding:2px 6px;border-radius:999px;border:1px solid #d5deea}
#imPatterns .im-tl .o,#imPatterns .im-tl .c{font-size:12.5px;line-height:1.35;padding:6px 10px;border-radius:10px;position:relative}
#imPatterns .im-tl .o{grid-column:1;text-align:right;background:#eaf8f2;color:#0d5b3f;justify-self:end;max-width:100%}
#imPatterns .im-tl .c{grid-column:3;background:#fdecec;color:#8e1f1f;justify-self:start;max-width:100%}
#imPatterns .im-tl .o:after,#imPatterns .im-tl .c:after{content:"";position:absolute;top:50%;width:10px;height:10px;border-radius:50%;margin-top:-5px}
#imPatterns .im-tl .o:after{right:-37px;background:#1baf7a}
#imPatterns .im-tl .c:after{left:-37px;background:#d03b3b}
#imPatterns details{font-size:13px;color:var(--ink2)}
#imPatterns details summary{cursor:pointer;font-weight:700;color:var(--ink)}
#imPatterns details a{color:#1767c9}
#imPatterns .im-note{font-size:12px;color:var(--muted);margin-top:6px}
#imTip{position:fixed;z-index:9999;pointer-events:none;background:#0f2742;color:#fff;border-radius:10px;padding:9px 11px;font:13px/1.4 system-ui;box-shadow:0 8px 24px rgba(15,39,66,.25);max-width:300px;opacity:0;transition:opacity .12s}
#imTip b{display:block;font-size:13.5px;margin-bottom:2px}
#imTip .r{display:flex;justify-content:space-between;gap:14px}
#imTip .r span:last-child{font-variant-numeric:tabular-nums;font-weight:700}
@media(max-width:820px){#imPatterns .im-hero,#imPatterns .im-gloss{grid-template-columns:repeat(2,minmax(0,1fr))}#imPatterns .im-two,#imPatterns .im-half{grid-template-columns:1fr}#imPatterns .im-tile b{font-size:24px}#imPatterns .im-tl{grid-template-columns:1fr 50px 1fr}#imPatterns .im-tl .o:after{right:-30px}#imPatterns .im-tl .c:after{left:-30px}}
`;

let tipEl=null;
function tip(html,ev){if(!tipEl){tipEl=document.createElement('div');tipEl.id='imTip';document.body.append(tipEl)}
 if(!html){tipEl.style.opacity=0;return}tipEl.innerHTML=html;tipEl.style.opacity=1;
 const w=tipEl.offsetWidth,h=tipEl.offsetHeight;let x=ev.clientX+14,y=ev.clientY+14;if(x+w>innerWidth-8)x=ev.clientX-w-14;if(y+h>innerHeight-8)y=ev.clientY-h-14;tipEl.style.left=x+'px';tipEl.style.top=y+'px'}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const row=(a,b)=>`<div class="r"><span>${esc(a)}</span><span>${esc(b)}</span></div>`;
function commentary(el,c){if(!c)return;el.querySelector(':scope > .im-comment')?.remove();const b=document.createElement('div');b.className='im-comment';
 b.innerHTML=`<h4>${esc(c.title)}</h4>${c.points.map(p=>`<p><strong>${esc(p.head)}.</strong> ${esc(p.text)}</p>`).join('')}${c.sources?.length?`<small>Sources: ${c.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ')}</small>`:''}`;el.append(b)}
function card(root,title,sub){const c=document.createElement('section');c.className='im-card';c.innerHTML=`<h3>${esc(title)}</h3>${sub?`<p class="im-sub">${esc(sub)}</p>`:''}`;root.append(c);return c}
const widthOf=el=>Math.max(280,Math.min(1100,el.clientWidth-4));
const box=(parent,cls)=>{const d=document.createElement('div');if(cls)d.className=cls;parent.append(d);return d};
const isActive=p=>p.status!=='closed'&&p.status!=='coming';

// ---------- 1. World tile map ----------
function countryGroups(data){const m=new Map();for(const p of data.programmes){if(!m.has(p.iso3))m.set(p.iso3,{iso:p.iso3,country:p.country,progs:[]});m.get(p.iso3).progs.push(p)}
 for(const g of m.values()){const act=g.progs.filter(p=>p.status!=='closed');const pick=(act.length?act:g.progs).slice().sort((a,b)=>BUY_ORDER.indexOf(a.buys)-BUY_ORDER.indexOf(b.buys)||(a.usd??9e9)-(b.usd??9e9))[0];g.main=pick;g.allClosed=!act.length;g.coming=act.length&&act.every(p=>p.status==='coming')}
 return [...m.values()]}
function detailHTML(data,g){
 const progs=g.progs.slice().sort((a,b)=>(a.status==='closed')-(b.status==='closed'));
 const col=g.allClosed?C.closed:data.buys[g.main.buys].color;
 return {col,html:`<h4>${esc(g.country)}</h4>${progs.map(p=>{const st=data.status[p.status];return `<div class="p"><b>${esc(p.name)}</b><div style="margin:4px 0"><span class="tag" style="background:${data.buys[p.buys].color}">${esc(data.buys[p.buys].label)}</span><span class="tag" style="background:${st.color}">${esc(st.label)}</span></div>
  <div class="big">${esc(fmtLocal(p))}</div>${p.usd&&p.currency!=='USD'?`<div class="im-note">≈ ${fmtUSD(p.usd)}</div>`:''}<div>${esc(p.note)}</div>
  ${p.db_change?`<div class="chg">Update vs. partner database: ${esc(p.db_change)}</div>`:''}<div style="margin-top:6px"><a href="${esc(p.url)}" target="_blank" rel="noopener">Official source ↗</a>${p.sources.length?' · '+p.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title.split(',')[0])}</a>`).join(' · '):''}</div></div>`}).join('')}`}}
const PHONE_REGIONS=[['Caribbean',['KNA','ATG','DMA','LCA','GRD','VCT','DOM']],['Americas',['USA','CAN','CRI','PAN','BRA','PRY','ARG']],['Europe',['PRT','ESP','IRL','GBR','ITA','MLT','GRC','CYP','HUN','LVA','TUR']],['Gulf & Middle East',['ARE','SAU','QAT','BHR','KWT','OMN','JOR','EGY']],['Africa',['SLE','STP','MUS']],['Asia',['HKG','SGP','MYS','THA','KHM','IDN','PHL']],['Pacific',['AUS','NZL','VUT','NRU']]];
function drawMap(d3,el,data,state){
 el.querySelector('svg')?.remove();
 const groups=countryGroups(data).filter(g=>TILE[g.iso]);
 const W0=widthOf(el),phone=W0<600;
 if(phone){const per=6,gap=4,s=Math.floor((W0-gap*(per-1))/per);let y=0;const pos={},labs=[];for(const [name,isos] of PHONE_REGIONS){labs.push([name,y+12]);y+=20;isos.forEach((iso,i)=>{pos[iso]=[(i%per)*(s+gap),y+Math.floor(i/per)*(s+gap)]});y+=Math.ceil(isos.length/per)*(s+gap)+6}
  state._phone={pos,labs,s,H:y};}
 else state._phone=null;
 const W=W0,cols=22,rows=12,gap=3,s=phone?state._phone.s:Math.floor((W-gap*cols)/cols),H=phone?state._phone.H:(s+gap)*rows+6;
 const at=g=>phone?state._phone.pos[g.iso]:[TILE[g.iso][0]*(s+gap),TILE[g.iso][1]*(s+gap)];
 const svg=d3.select(el).insert('svg','.im-legend').attr('viewBox',`0 0 ${W} ${H}`).attr('role','img').attr('aria-label','World map of investment migration programmes');
 const defs=svg.append('defs');defs.append('pattern').attr('id','imHatch').attr('width',6).attr('height',6).attr('patternUnits','userSpaceOnUse').attr('patternTransform','rotate(45)').append('rect').attr('width',2).attr('height',6).attr('fill','#e5b3b3');
 if(phone)for(const [l,y] of state._phone.labs)svg.append('text').attr('x',0).attr('y',y).attr('font-size',11).attr('font-weight',800).attr('letter-spacing','1px').attr('fill','#8a99ab').text(l.toUpperCase());
 else for(const [l,c,r] of REGIONS)svg.append('text').attr('x',c*(s+gap)+s/2).attr('y',r*(s+gap)+s*.62).attr('text-anchor','middle').attr('font-size',11).attr('font-weight',800).attr('letter-spacing','1.5px').attr('fill','#b6c3d2').text(l);
 const mode=state.mapMode||'buys';
 const fill=g=>{if(g.allClosed)return 'url(#imHatch)';if(mode==='status'){return data.status[g.progs.filter(p=>p.status!=='closed').map(p=>p.status).sort((a,b)=>['winding','verify','coming','open'].indexOf(a)-['winding','verify','coming','open'].indexOf(b))[0]||'open'].color}return data.buys[g.main.buys].color};
 const tiles=svg.append('g').selectAll('g').data(groups).join('g').attr('transform',g=>`translate(${at(g)[0]},${at(g)[1]})`).style('cursor','pointer');
 tiles.append('rect').attr('width',s).attr('height',s).attr('rx',Math.max(3,s*.14)).attr('fill',fill).attr('stroke',g=>g.allClosed?C.closed:g.coming?'#e87ba4':'#fff').attr('stroke-width',g=>g.allClosed||g.coming?1.6:1).attr('stroke-dasharray',g=>g.coming?'3 2':null)
  .attr('fill-opacity',g=>mode==='buys'&&g.coming?.35:1);
 const dark=g=>!g.allClosed&&!(mode==='buys'&&g.coming)&&!(mode==='status'&&g.progs.some(p=>p.status==='verify')&&!g.progs.some(p=>p.status==='winding'));
 tiles.append('text').attr('x',s/2).attr('y',s*(s>=30?.45:.62)).attr('text-anchor','middle').attr('font-size',Math.max(7,Math.min(12,s*(s>=30?.27:.3)))).attr('font-weight',800).attr('fill',g=>g.allClosed?'#8e1f1f':dark(g)?'#fff':C.ink).text(g=>g.iso);
 if(s>=30)tiles.append('text').attr('x',s/2).attr('y',s*.8).attr('text-anchor','middle').attr('font-size',Math.min(10.5,s*.24)).attr('fill',g=>g.allClosed?'#8e1f1f':dark(g)?'rgba(255,255,255,.9)':C.ink2).text(g=>g.allClosed?'closed':g.main.usd?fmtUSD(g.main.usd).replace('US$','$'):'—');
 tiles.filter(g=>g.progs.length>1).append('circle').attr('cx',s-4).attr('cy',4).attr('r',Math.max(3,s*.09)).attr('fill','#fff').attr('stroke',C.ink).attr('stroke-width',1);
 tiles.on('pointermove',(ev,g)=>tip(`<b>${esc(g.country)}</b>${g.progs.map(p=>row(p.name,p.status==='closed'?'closed':p.usd?fmtUSD(p.usd):'—')).join('')}<div style="opacity:.7;margin-top:3px">Click for details</div>`,ev)).on('pointerleave',()=>tip(null))
  .on('click',(ev,g)=>{state.mapSel=g.iso;show(g)});
 const show=g=>{const d=detailHTML(data,g);state.detail.style.setProperty('--a',d.col);state.detail.innerHTML=d.html;tiles.select('rect').attr('stroke-width',x=>x.iso===g.iso?3:(x.allClosed||x.coming?1.6:1)).attr('stroke',x=>x.iso===g.iso?C.ink:x.allClosed?C.closed:x.coming?'#e87ba4':'#fff')};
 show(groups.find(g=>g.iso===(state.mapSel||'GRC'))||groups[0]);
}

// ---------- 2. Price ladder (beeswarm on a log scale) ----------
function drawLadder(d3,el,data,state){
 el.querySelector('svg')?.remove();
 const items=data.programmes.filter(p=>p.usd&&p.status!=='closed').map(p=>({...p}));
 const W=widthOf(el),narrow=W<600,lane=narrow?92:104,m={t:16,r:14,b:34,l:narrow?84:150},H=m.t+lane*3+m.b;
 const x=d3.scaleLog().domain([70000,30000000]).range([m.l,W-m.r]);
 const svg=d3.select(el).insert('svg','.im-comment').attr('viewBox',`0 0 ${W} ${H}`).attr('role','img').attr('aria-label','Minimum investment of each open programme in US dollars, log scale');
 const ticks=[1e5,2.5e5,5e5,1e6,2.5e6,5e6,1e7,2.5e7];
 for(const t of ticks){svg.append('line').attr('x1',x(t)).attr('x2',x(t)).attr('y1',m.t).attr('y2',H-m.b).attr('stroke',C.grid);svg.append('text').attr('x',x(t)).attr('y',H-m.b+16).attr('text-anchor','middle').attr('font-size',narrow?9.5:11).attr('fill',C.muted).text(fmtUSD(t).replace('US$','$'))}
 svg.append('text').attr('x',W-m.r).attr('y',H-4).attr('text-anchor','end').attr('font-size',11).attr('fill',C.muted).text('Minimum entry, US$ (log scale)');
 BUY_ORDER.forEach((b,i)=>{const y0=m.t+i*lane;svg.append('rect').attr('x',0).attr('y',y0+2).attr('width',W).attr('height',lane-4).attr('rx',10).attr('fill',i%2?'#fafcfe':'#f4f8fd');
  const lab=data.buys[b].label;svg.append('text').attr('x',8).attr('y',y0+lane/2+12).attr('font-size',narrow?11:13).attr('font-weight',700).attr('fill',data.buys[b].color).text(narrow?lab.replace('Long-term ','').replace('Permanent residence','Permanent').replace(' (passport)',''):lab)});
 const r=narrow?6:7.5;
 for(const d of items){d.x=x(d.usd);d.y=m.t+BUY_ORDER.indexOf(d.buys)*lane+lane/2}
 const sim=d3.forceSimulation(items).force('x',d3.forceX(d=>x(d.usd)).strength(1)).force('y',d3.forceY(d=>m.t+BUY_ORDER.indexOf(d.buys)*lane+lane/2+8).strength(.08)).force('c',d3.forceCollide(r+1.2)).stop();
 for(let i=0;i<160;i++)sim.tick();
 for(const d of items){const yc=m.t+BUY_ORDER.indexOf(d.buys)*lane+lane/2;d.y=Math.max(yc-lane/2+r+22,Math.min(yc+lane/2-r-4,d.y))}
 const filt=state.ladderRegion;
 const dots=svg.append('g').selectAll('circle').data(items).join('circle').attr('cx',d=>d.x).attr('cy',d=>d.y).attr('r',r).attr('fill',d=>data.buys[d.buys].color)
  .attr('stroke',d=>d.status==='open'?'#fff':data.status[d.status].color).attr('stroke-width',d=>d.status==='open'?1.2:2.4)
  .attr('opacity',d=>!filt||d.region===filt||(filt==='Middle East'&&d.region==='Middle East')?1:.12).style('cursor','pointer')
  .on('pointermove',(ev,d)=>tip(`<b>${esc(d.country)}</b>${esc(d.name)}${row('Minimum',fmtLocal(d))}${d.currency!=='USD'?row('≈ US$',fmtUSD(d.usd)):''}${row('Status',data.status[d.status].label)}`,ev)).on('pointerleave',()=>tip(null))
  .on('click',(ev,d)=>{state.mapSel=d.iso3;state.goMap?.()});
 // label the cheapest and most expensive in each lane
 const labels=[];for(const b of BUY_ORDER){const l=items.filter(d=>d.buys===b&&(!filt||d.region===filt));if(!l.length)continue;const lo=l.reduce((a,c)=>c.usd<a.usd?c:a),hi=l.reduce((a,c)=>c.usd>a.usd?c:a);labels.push([lo,'start']);if(hi!==lo&&!narrow)labels.push([hi,'end'])}
 const lt=d=>m.t+BUY_ORDER.indexOf(d.buys)*lane+15;
 svg.append('g').selectAll('line').data(labels).join('line').attr('x1',([d])=>d.x).attr('x2',([d])=>d.x).attr('y1',([d])=>lt(d)+3).attr('y2',([d])=>d.y-r).attr('stroke',C.ink2).attr('stroke-width',1).attr('stroke-dasharray','2 2');
 svg.append('g').selectAll('text').data(labels).join('text').attr('x',([d,a])=>a==='start'?d.x-2:d.x+2).attr('y',([d])=>lt(d)).attr('text-anchor',([,a])=>a).attr('font-size',narrow?10:11.5).attr('font-weight',700).attr('fill',C.ink)
  .text(([d])=>d.country.replace(' & Príncipe','').replace('United Arab Emirates','UAE').replace('Hong Kong SAR','Hong Kong')+' '+fmtUSD(d.usd).replace('US$','$'));
}

// ---------- 3. What the money buys (Sankey) ----------
function drawFlow(d3,el,data){
 el.querySelector('svg')?.remove();
 const act=data.programmes.filter(p=>p.status!=='closed');
 const assets=[...new Set(act.map(p=>p.asset))].sort((a,b)=>act.filter(p=>p.asset===b).length-act.filter(p=>p.asset===a).length);
 const W=widthOf(el),narrow=W<600,H=narrow?380:340;
 const nodes=[...assets.map(a=>({id:'A_'+a,name:data.assets[a],kind:'asset'})),...BUY_ORDER.map(b=>({id:'B_'+b,name:data.buys[b].label,kind:'buy',b}))];
 const agg=new Map();for(const p of act){const k=p.asset+'|'+p.buys;const a=agg.get(k)||{source:'A_'+p.asset,target:'B_'+p.buys,value:0,b:p.buys,items:[]};a.value++;a.items.push(p.country);agg.set(k,a)}
 const sankey=d3.sankey().nodeId(d=>d.id).nodeWidth(12).nodePadding(narrow?12:14).nodeSort(null).extent([[narrow?118:190,6],[W-(narrow?110:200),H-6]]);
 const g=sankey({nodes:nodes.map(d=>({...d})),links:[...agg.values()].map(d=>({...d}))});
 const svg=d3.select(el).insert('svg','.im-comment').attr('viewBox',`0 0 ${W} ${H}`).attr('role','img').attr('aria-label','Which assets buy citizenship, permanent residence or residence');
 svg.append('g').attr('fill','none').selectAll('path').data(g.links).join('path').attr('d',d3.sankeyLinkHorizontal()).attr('stroke',d=>data.buys[d.b].color).attr('stroke-opacity',.45).attr('stroke-width',d=>Math.max(1.5,d.width)).style('mix-blend-mode','multiply')
  .on('pointermove',(ev,d)=>tip(`<b>${esc(d.source.name)} → ${esc(d.target.name)}</b>${d.value} programme${d.value>1?'s':''}<div style="opacity:.8;margin-top:3px">${esc(d.items.join(', '))}</div>`,ev)).on('pointerleave',()=>tip(null));
 const n=svg.append('g').selectAll('g').data(g.nodes).join('g');
 n.append('rect').attr('x',d=>d.x0).attr('y',d=>d.y0).attr('width',d=>d.x1-d.x0).attr('height',d=>Math.max(2,d.y1-d.y0)).attr('rx',3).attr('fill',d=>d.kind==='buy'?data.buys[d.b].color:'#8aa0b8');
 n.append('text').attr('x',d=>d.kind==='asset'?d.x0-8:d.x1+8).attr('y',d=>(d.y0+d.y1)/2+4).attr('text-anchor',d=>d.kind==='asset'?'end':'start').attr('font-size',narrow?11:12.5).attr('font-weight',650).attr('fill',C.ink)
  .text(d=>(narrow?d.name.replace('Donation / contribution','Donation').replace('Fund / financial assets','Funds').replace('Business / job creation','Business').replace('Choice of assets','Mixed').replace('Long-term residence','Residence').replace('Permanent residence','Permanent').replace(' (passport)',''):d.name)+' · '+d.value);
}

// ---------- 4. Opened vs closed timeline ----------
function drawTimeline(el,data){
 el.querySelector('.im-tl')?.remove();
 const years=[...new Set(data.timeline.map(e=>e.year))].sort((a,b)=>a-b);
 const tl=document.createElement('div');tl.className='im-tl';
 tl.innerHTML=`<div style="grid-column:1;text-align:right;font-weight:800;color:#0d5b3f;font-size:13px">Opened</div><div></div><div style="grid-column:3;font-weight:800;color:#8e1f1f;font-size:13px">Closed or restricted</div>`+
  years.map(y=>{const o=data.timeline.filter(e=>e.year===y&&e.kind==='open').map(e=>e.label).join('; '),c=data.timeline.filter(e=>e.year===y&&e.kind==='close').map(e=>e.label).join('; ');
   return `${o?`<div class="o">${esc(o)}</div>`:'<div></div>'}<div class="y"><span>${y}</span></div>${c?`<div class="c">${esc(c)}</div>`:'<div></div>'}`}).join('');
 el.insertBefore(tl,el.querySelector('.im-comment'));
}

// ---------- 5. Caribbean: price floor + revenue dependence ----------
function drawCaribbean(d3,left,right,data){
 for(const el of [left,right])el.querySelector('svg')?.remove();
 const rows=data.caribbean_prices.rows,W=widthOf(left),H=300,m={t:28,r:W<420?96:150,b:22,l:W<420?96:150};
 const y=d3.scaleLinear().domain([80000,260000]).range([H-m.b,m.t]);
 const svg=d3.select(left).append('svg').attr('viewBox',`0 0 ${W} ${H}`).attr('role','img').attr('aria-label','Caribbean minimum donation before and after the 2024 price floor');
 const xa=m.l,xb=W-m.r;
 svg.append('text').attr('x',xa).attr('y',14).attr('text-anchor','middle').attr('font-size',12).attr('font-weight',700).attr('fill',C.muted).text('Before');
 svg.append('text').attr('x',xb).attr('y',14).attr('text-anchor','middle').attr('font-size',12).attr('font-weight',700).attr('fill',C.muted).text('Since mid-2024');
 svg.append('line').attr('x1',xa).attr('x2',xb).attr('y1',y(200000)).attr('y2',y(200000)).attr('stroke',C.closed).attr('stroke-dasharray','4 4');
 svg.append('text').attr('x',xa-9).attr('y',y(200000)+4).attr('text-anchor','end').attr('font-size',11).attr('font-weight',700).attr('fill',C.closed).text('US$200k floor');
 const col=d3.scaleOrdinal(['#6250d6','#2a78d6','#1baf7a','#eb6834','#e87ba4']);
 const dodge=(arr,key)=>{const s=arr.map(r=>({r,y:y(r[key])})).sort((a,b)=>a.y-b.y);for(let i=1;i<s.length;i++)if(s[i].y-s[i-1].y<14)s[i].y=s[i-1].y+14;return new Map(s.map(o=>[o.r,o.y]))};
 const la=dodge(rows,'before'),lb=dodge(rows,'after');
 rows.forEach((r,i)=>{const c=col(i);const p=svg.append('line').attr('x1',xa).attr('x2',xa).attr('y1',y(r.before)).attr('y2',y(r.before)).attr('stroke',c).attr('stroke-width',2.5);p.transition().duration(1100).delay(i*90).attr('x2',xb).attr('y2',y(r.after));
  svg.append('circle').attr('cx',xa).attr('cy',y(r.before)).attr('r',5).attr('fill',c);svg.append('circle').attr('cx',xb).attr('cy',y(r.after)).attr('r',5).attr('fill',c);
  const short=W<420?r.country.replace(' & Barbuda','').replace(' & Nevis','').replace('Saint Lucia','St Lucia'):r.country;
  svg.append('text').attr('x',xa-9).attr('y',la.get(r)+4).attr('text-anchor','end').attr('font-size',11.5).attr('fill',C.ink).text(short+' '+fmtUSD(r.before).replace('US$','$'));
  svg.append('text').attr('x',xb+9).attr('y',lb.get(r)+4).attr('font-size',11.5).attr('font-weight',700).attr('fill',C.ink).text(fmtUSD(r.after).replace('US$','$')+' '+short)});
 // St Kitts revenue
 const rv=data.skn_revenue.rows,W2=widthOf(right),H2=300,m2={t:28,r:14,b:26,l:36};
 const x2=d3.scaleBand().domain(rv.map(d=>d.year)).range([m2.l,W2-m2.r]).padding(.28),y2=d3.scaleLinear().domain([0,30]).range([H2-m2.b,m2.t]);
 const s2=d3.select(right).append('svg').attr('viewBox',`0 0 ${W2} ${H2}`).attr('role','img').attr('aria-label','St Kitts and Nevis CBI revenue as percent of GDP');
 for(const v of [0,10,20,30]){s2.append('line').attr('x1',m2.l).attr('x2',W2-m2.r).attr('y1',y2(v)).attr('y2',y2(v)).attr('stroke',C.grid);s2.append('text').attr('x',m2.l-6).attr('y',y2(v)+4).attr('text-anchor','end').attr('font-size',10.5).attr('fill',C.muted).text(v+'%')}
 s2.append('g').selectAll('rect').data(rv).join('rect').attr('x',d=>x2(d.year)).attr('width',x2.bandwidth()).attr('y',y2(0)).attr('height',0).attr('rx',4).attr('fill',d=>d.year>=2024?C.closed:'#6250d6').attr('opacity',d=>d.est?.55:1)
  .on('pointermove',(ev,d)=>tip(`<b>St Kitts & Nevis ${d.year}</b>${row('CBI revenue',d.v+'% of GDP'+(d.est?' (estimate)':''))}`,ev)).on('pointerleave',()=>tip(null))
  .transition().duration(900).attr('y',d=>y2(d.v)).attr('height',d=>y2(0)-y2(d.v));
 s2.append('g').selectAll('text').data(rv).join('text').attr('x',d=>x2(d.year)+x2.bandwidth()/2).attr('y',d=>y2(d.v)-5).attr('text-anchor','middle').attr('font-size',11).attr('font-weight',700).attr('fill',C.ink).text(d=>(d.est?'~':'')+d.v+'%');
 s2.append('g').selectAll('text.x').data(rv).join('text').attr('x',d=>x2(d.year)+x2.bandwidth()/2).attr('y',H2-8).attr('text-anchor','middle').attr('font-size',10.5).attr('fill',C.muted).text(d=>W2<360?"'"+String(d.year).slice(2):d.year);
}

// ---------- 6. Passport access matrix + pressure timeline ----------
function drawAccess(d3,el,data){
 el.querySelector('svg')?.remove();el.querySelector('.im-events')?.remove();
 const a=data.access,W=widthOf(el),narrow=W<600,lw=narrow?96:150,cw=(W-lw)/a.destinations.length,rh=narrow?30:34,H=36+a.rows.length*rh;
 const colr={ok:'#1baf7a',limited:C.amber,visa:C.closed};
 const svg=d3.select(el).insert('svg','.im-legend').attr('viewBox',`0 0 ${W} ${H}`).attr('role','img').attr('aria-label','Visa-free access of investment passports to Schengen, UK, Ireland and US');
 a.destinations.forEach((d,j)=>svg.append('text').attr('x',lw+j*cw+cw/2).attr('y',20).attr('text-anchor','middle').attr('font-size',narrow?10.5:12.5).attr('font-weight',700).attr('fill',C.ink).text(narrow?d.replace('United Kingdom','UK').replace('United States','US'):d));
 a.rows.forEach((r,i)=>{const y0=30+i*rh;svg.append('text').attr('x',lw-10).attr('y',y0+rh/2+4).attr('text-anchor','end').attr('font-size',narrow?10.5:12.5).attr('fill',C.ink).text(narrow?r.country.replace(' & Barbuda','').replace(' & Nevis',''):r.country);
  r.cells.forEach((c,j)=>{svg.append('rect').attr('x',lw+j*cw+3).attr('y',y0+3).attr('width',cw-6).attr('height',rh-6).attr('rx',6).attr('fill',colr[c]).attr('opacity',.9).style('cursor','default')
   .on('pointermove',ev=>tip(`<b>${esc(r.country)} → ${esc(a.destinations[j])}</b>${esc(a.legend[c])}<div style="opacity:.85;margin-top:3px">${esc(r.notes[j])}</div>`,ev)).on('pointerleave',()=>tip(null));
   if(!narrow)svg.append('text').attr('x',lw+j*cw+cw/2).attr('y',y0+rh/2+4).attr('text-anchor','middle').attr('font-size',11).attr('font-weight',700).attr('fill','#fff').attr('pointer-events','none').text(c==='ok'?'visa-free':c==='limited'?'restricted':'visa')})});
 // pressure timeline
 const ev=a.events.map(e=>({...e,t:new Date(e.date+'-15')}));const box2=document.createElement('div');box2.className='im-events';el.insertBefore(box2,el.querySelector('.im-comment'));
 const H2=ev.length*30+20,svg2=d3.select(box2).append('svg').attr('viewBox',`0 0 ${W} ${H2}`).attr('role','img').attr('aria-label','Timeline of pressure on investment passports 2022 to 2028');
 const now=new Date('2026-11-15');
 if(true){const y=d3.scaleTime().domain(d3.extent(ev,e=>e.t)).range([12,H2-12]);svg2.append('line').attr('x1',70).attr('x2',70).attr('y1',8).attr('y2',H2-8).attr('stroke','#d5deea').attr('stroke-width',2);
  ev.forEach((e,i)=>{const yy=12+i*30;svg2.append('circle').attr('cx',70).attr('cy',yy).attr('r',5).attr('fill',e.t>now?'#fff':C.ink).attr('stroke',C.ink).attr('stroke-width',2);svg2.append('text').attr('x',60).attr('y',yy+4).attr('text-anchor','end').attr('font-size',10.5).attr('font-weight',700).attr('fill',C.ink2).text(d3.timeFormat('%b %Y')(e.t));svg2.append('text').attr('x',82).attr('y',yy+4).attr('font-size',narrow?11:12.5).attr('font-weight',e.t>now?700:400).attr('fill',e.t>now?'#8a5a00':C.ink).text(narrow&&e.label.length>46?e.label.slice(0,44)+'…':e.label).append('title').text(e.label);if(i&&ev[i-1].t<=now&&e.t>now)svg2.append('text').attr('x',4).attr('y',yy-11).attr('font-size',10).attr('font-weight',800).attr('fill',C.amber).text('TODAY ▸')})}
 else{const x=d3.scaleTime().domain([new Date('2021-12-01'),new Date('2028-08-01')]).range([30,W-30]),ym=H2/2;
  svg2.append('line').attr('x1',30).attr('x2',W-30).attr('y1',ym).attr('y2',ym).attr('stroke','#d5deea').attr('stroke-width',2);
  svg2.append('rect').attr('x',x(now)).attr('y',ym-4).attr('width',x(new Date('2028-08-01'))-x(now)).attr('height',8).attr('fill','#fff6e0');
  svg2.append('text').attr('x',x(now)).attr('y',ym+4).attr('dy',-10).attr('text-anchor','middle').attr('font-size',10).attr('font-weight',800).attr('fill',C.amber).text('TODAY');
  for(const yr of [2022,2023,2024,2025,2026,2027,2028])svg2.append('text').attr('x',x(new Date(yr+'-01-01'))).attr('y',ym+18).attr('text-anchor','middle').attr('font-size',10.5).attr('fill',C.muted).text(yr);
  const lvl=[-1,1,-2,2];ev.forEach((e,i)=>{const L=lvl[i%4],xx=x(e.t),yy=ym+L*36;svg2.append('line').attr('x1',xx).attr('x2',xx).attr('y1',ym).attr('y2',yy+(L<0?6:-6)).attr('stroke','#b6c3d2');
   svg2.append('circle').attr('cx',xx).attr('cy',ym).attr('r',5).attr('fill',e.t>now?'#fff':C.ink).attr('stroke',C.ink).attr('stroke-width',2);
   const words=e.label.split(' ');const lines=[];let cur='';for(const w of words){if((cur+' '+w).trim().length>26){lines.push(cur.trim());cur=w}else cur+=' '+w}lines.push(cur.trim());
   const t=svg2.append('text').attr('x',xx).attr('y',L<0?yy-(lines.length-1)*12:yy+6).attr('text-anchor',xx<90?'start':xx>W-90?'end':'middle').attr('font-size',10.5).attr('fill',C.ink);
   lines.forEach((l,k)=>t.append('tspan').attr('x',xx).attr('dy',k?12:0).attr('font-weight',k?400:600).text(k?l:d3.timeFormat('%b %Y')(e.t)+': '+l))})}
}

// ---------- 7. Volumes ----------
function drawVolumes(d3,left,right,data){
 for(const el of [left,right])el.querySelector('svg')?.remove();
 const pt=data.volumes.portugal.rows,W=widthOf(left),H=290,m={t:26,r:10,b:26,l:40};
 const x=d3.scaleBand().domain(pt.map(d=>d[0])).range([m.l,W-m.r]).padding(.22),y=d3.scaleLinear().domain([0,3200]).range([H-m.b,m.t]);
 const svg=d3.select(left).append('svg').attr('viewBox',`0 0 ${W} ${H}`).attr('role','img').attr('aria-label','Portugal golden visa permits per year');
 for(const v of [0,1000,2000,3000]){svg.append('line').attr('x1',m.l).attr('x2',W-m.r).attr('y1',y(v)).attr('y2',y(v)).attr('stroke',C.grid);svg.append('text').attr('x',m.l-6).attr('y',y(v)+4).attr('text-anchor','end').attr('font-size',10.5).attr('fill',C.muted).text(v?v/1000+'k':'0')}
 svg.append('rect').attr('x',x(2023)-x.step()*x.padding()/2).attr('y',m.t-14).attr('width',W-m.r-x(2023)+x.step()*x.padding()/2).attr('height',H-m.b-m.t+14).attr('fill','#fff6e0');
 svg.append('text').attr('x',W-m.r-3).attr('y',m.t-3).attr('text-anchor','end').attr('font-size',10.5).attr('font-weight',700).attr('fill','#8a5a00').text('No property →');
 svg.append('g').selectAll('rect.b').data(pt).join('rect').attr('x',d=>x(d[0])).attr('width',x.bandwidth()).attr('y',y(0)).attr('height',0).attr('rx',3).attr('fill',d=>d[0]>=2023?C.amber:'#2a78d6')
  .on('pointermove',(ev,d)=>tip(`<b>Portugal ${d[0]}</b>${row('Golden visas (main investor)',d[1].toLocaleString('en'))}`,ev)).on('pointerleave',()=>tip(null)).transition().duration(900).attr('y',d=>y(d[1])).attr('height',d=>y(0)-y(d[1]));
 svg.append('g').selectAll('text').data(pt).join('text').attr('x',d=>x(d[0])+x.bandwidth()/2).attr('y',H-8).attr('text-anchor','middle').attr('font-size',10).attr('fill',C.muted).text(d=>W<420?"'"+String(d[0]).slice(2):d[0]);
 const pk=pt.reduce((a,b)=>b[1]>a[1]?b:a);svg.append('text').attr('x',x(pk[0])+x.bandwidth()/2).attr('y',y(pk[1])-5).attr('text-anchor','middle').attr('font-size',11).attr('font-weight',700).attr('fill',C.ink).text(pk[1].toLocaleString('en'));
 // scale comparison, log bars
 const sc=data.volumes.scale,W2=widthOf(right),rh=40,H2=sc.length*rh+24,lw=0;
 const x2=d3.scaleLog().domain([100,150000]).range([4,W2-70]);
 const s2=d3.select(right).append('svg').attr('viewBox',`0 0 ${W2} ${H2}`).attr('role','img').attr('aria-label','Scale of programmes, people or permits, log scale');
 sc.forEach((d,i)=>{const y0=i*rh;s2.append('text').attr('x',lw).attr('y',y0+12).attr('font-size',11.5).attr('fill',C.ink).text(d.label);
  s2.append('rect').attr('x',4).attr('y',y0+17).attr('height',13).attr('rx',4).attr('width',0).attr('fill',i===0?'#6250d6':'#2a78d6').on('pointermove',ev=>tip(`<b>${esc(d.label)}</b>${row('Count',d.v.toLocaleString('en'))}<div style="opacity:.8">${esc(d.src)}</div>`,ev)).on('pointerleave',()=>tip(null)).transition().duration(900).attr('width',x2(d.v)-4);
  s2.append('text').attr('x',x2(d.v)+6).attr('y',y0+28).attr('font-size',11.5).attr('font-weight',700).attr('fill',C.ink).text(d.v.toLocaleString('en'))});
 s2.append('text').attr('x',W2).attr('y',H2-2).attr('text-anchor','end').attr('font-size',10.5).attr('fill',C.muted).text('Log scale: each step is 10×');
}

export async function mount(root){
 if(root.dataset.ready)return;root.dataset.ready='1';
 const st=document.createElement('style');st.textContent=CSS;document.head.append(st);
 root.innerHTML='<p class="im-sub">Loading charts…</p>';
 let d3,data;
 try{[d3,data]=await Promise.all([loadD3(),fetch(DATA_URL,{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('data file '+r.status);return r.json()})])}
 catch(e){root.innerHTML='<p class="im-sub">Charts could not load: '+esc(e.message)+'</p>';delete root.dataset.ready;return}
 root.innerHTML='';
 const P=data.programmes,open=P.filter(isActive),cbi=open.filter(p=>p.buys==='citizenship'&&p.usd);
 const cheapest=cbi.reduce((a,b)=>b.usd<a.usd?b:a);
 const closedSince=P.filter(p=>p.status==='closed'&&p.closed>=2020).length;
 const hero=box(root,'im-hero');
 hero.innerHTML=[[open.length,'programmes open now (of '+P.length+' tracked)',  '#1baf7a'],[fmtUSD(cheapest.usd),'cheapest passport ('+P.filter(p=>p.buys==='citizenship'&&p.usd===cheapest.usd&&isActive(p)).map(p=>p.country.replace(' & Príncipe','')).join(', ')+')','#6250d6'],['107,000','Caribbean passports sold (EU estimate)','#eb6834'],[closedSince,'programmes closed since 2020',C.closed]]
  .map(([b,s,a])=>`<div class="im-tile" style="--a:${a}"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');
 const gl=box(root,'im-gloss');gl.innerHTML=data.glossary.map(g=>`<div><b>${esc(g.term)}</b><em>${esc(g.long)}</em><br>${esc(g.text)}</div>`).join('');
 const state={};
 // map
 const cMap=card(root,'Where money buys a passport or a residence permit','One square per country. Colour = what the money buys; striped = closed. Click a country.');
 const mchips=box(cMap,'im-row');mchips.innerHTML=`<button class="im-chip" type="button" data-m="buys" aria-pressed="true">What it buys</button><button class="im-chip" type="button" data-m="status" aria-pressed="false">Status</button>`;
 const mwrap=box(cMap),mapEl=box(mwrap),det=box(mwrap,'im-detail');det.style.marginTop='10px';state.detail=det;
 const leg=box(mapEl,'im-legend');
 const setLegend=()=>{leg.innerHTML=(state.mapMode==='status'?Object.entries(data.status).filter(([k])=>k!=='closed').map(([,v])=>v):BUY_ORDER.map(b=>data.buys[b]).concat([{label:'Announced',color:'rgba(232,123,164,.35)'}])).map(s=>`<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')+`<span><i style="background:repeating-linear-gradient(45deg,#e5b3b3 0 2px,#fff 2px 5px);outline:1px solid ${C.closed}"></i>Closed</span><span><i style="background:#fff;border:1px solid ${C.ink};border-radius:50%"></i>Several programmes</span>`};
 mchips.onclick=e=>{const b=e.target.closest('button');if(!b)return;state.mapMode=b.dataset.m;for(const x of mchips.querySelectorAll('button'))x.setAttribute('aria-pressed',String(x===b));setLegend();drawMap(d3,mapEl,data,state)};
 setLegend();
 state.goMap=()=>{drawMap(d3,mapEl,data,state);cMap.scrollIntoView({behavior:'smooth',block:'start'})};
 // ladder
 const cLad=card(root,'What it costs: every open programme on one price line','Minimum entry in US dollars, log scale. Dots with a coloured ring need checking or are being phased out. Click a dot to open it on the map.');
 const lchips=box(cLad,'im-row');const regions=['Caribbean','Europe','Middle East','Americas','Asia','Africa','Pacific'];
 lchips.innerHTML=`<button class="im-chip" type="button" data-r="" aria-pressed="true">All regions</button>`+regions.map(r=>`<button class="im-chip" type="button" data-r="${r}" aria-pressed="false">${r==='Middle East'?'Gulf & Middle East':r}</button>`).join('');
 lchips.onclick=e=>{const b=e.target.closest('button');if(!b)return;state.ladderRegion=b.dataset.r||null;for(const x of lchips.querySelectorAll('button'))x.setAttribute('aria-pressed',String(x===b));drawLadder(d3,cLad,data,state)};
 // flow
 const cFlow=card(root,'What your money buys','Each line is a group of open programmes: the asset you put in (left) and what you get (right). Hover a line to see the countries.');
 // timeline
 const cTl=card(root,'Twenty years of openings and closures','Major programme launches (left) and closures or restrictions (right).');
 // caribbean
 const cCar=card(root,'The Caribbean: price floor and money at stake','Left: minimum donation before and after the 2024 regional agreement. Right: how much one island depends on passport sales.');
 const cw=box(cCar,'im-half'),carL=box(cw),carR=box(cw);carL.innerHTML='<p class="im-mini">Minimum donation, single applicant</p>';carR.innerHTML='<p class="im-mini">St Kitts & Nevis: CBI revenue, % of GDP (IMF)</p>';
 // access
 const cAcc=card(root,'What a passport can still do','Visa-free travel of investment passports today, and the timeline of pressure from Europe. Hover a square for the date.');
 const al=box(cAcc,'im-legend');al.innerHTML=Object.entries(data.access.legend).map(([k,v])=>`<span><i style="background:${k==='ok'?'#1baf7a':k==='limited'?C.amber:C.closed}"></i>${esc(v)}</span>`).join('')+`<span><i style="background:#fff;border:2px solid ${C.ink};border-radius:50%"></i>Upcoming date</span>`;
 // volumes
 const cVol=card(root,'How many people actually use them','Left: Portugal golden visas per year. Right: the scale of different programmes (people, permits or passports, as reported).');
 const vw=box(cVol,'im-half'),volL=box(vw),volR=box(vw);volL.innerHTML='<p class="im-mini">Portugal: golden visas to main investors per year</p>';volR.innerHTML='<p class="im-mini">Scale, cumulative</p>';
 // sources
 const foot=document.createElement('section');foot.className='im-card';
 foot.innerHTML=`<details><summary>Sources, method & check of the partner database</summary><p><strong>Status as of ${esc(data.as_of)}.</strong> ${esc(data.db_review)}</p><p>${esc(data.fx_note)}</p>
  <p>Every programme links to its official authority on the map. Figures marked "verify" must be confirmed in writing with the authority before being quoted to a client. Blue Ocean is not a licensed immigration agent: filings go through authorised agents and local lawyers.</p>
  <ul>${data.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ul></details>`;
 root.append(foot);
 const render=()=>{drawMap(d3,mapEl,data,state);commentary(cMap,data.commentary.map);drawLadder(d3,cLad,data,state);commentary(cLad,data.commentary.ladder);drawFlow(d3,cFlow,data);commentary(cFlow,data.commentary.flow);
  commentary(cTl,data.commentary.timeline);drawTimeline(cTl,data);drawCaribbean(d3,carL,carR,data);commentary(cCar,data.commentary.caribbean);commentary(cAcc,data.commentary.access);drawAccess(d3,cAcc,data);drawVolumes(d3,volL,volR,data);commentary(cVol,data.commentary.volumes)};
 render();
 let t,lastW=root.clientWidth;new ResizeObserver(()=>{const w=root.clientWidth;if(Math.abs(w-lastW)<8)return;lastW=w;clearTimeout(t);t=setTimeout(render,200)}).observe(root);
}
