/* Daily study history. SVG keeps every day visible, including in leap years. */
(() => {
  'use strict';
  const WIDTH=1000,HEIGHT=240,LEFT=12,RIGHT=988,TOP=14,BASE=224;
  const preferenceKey='orbita-study-chart-v1';
  let preferences={scale:'week',goal:true};
  try{const saved=JSON.parse(localStorage.getItem(preferenceKey)||'{}');if(['week','month','year'].includes(saved.scale))preferences.scale=saved.scale;if(typeof saved.goal==='boolean')preferences.goal=saved.goal;}catch{}
  let state={...preferences,offset:0,selected:null},current=null,source=[],weeklyGoal=15;
  const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const date=(y,m,d)=>new Date(y,m,d,12);
  const parse=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(s+'T12:00:00');return !isNaN(d)&&key(d)===s?d:null;};
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const duration=n=>{const m=Math.max(0,Math.round(n)),h=Math.floor(m/60);return h?`${h}h${m%60?' '+m%60+'min':''}`:`${m}min`;};
  const hours=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(n/60)+'h';
  const fullDate=d=>d.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const shortDate=d=>d.toLocaleDateString('pt-BR',{day:'numeric',month:'short'}).replaceAll('.','');
  function bounds(scale,offset,now){
    let start,end;
    if(scale==='week'){start=date(now.getFullYear(),now.getMonth(),now.getDate()-(now.getDay()+6)%7+offset*7);end=date(start.getFullYear(),start.getMonth(),start.getDate()+6);}
    else if(scale==='month'){start=date(now.getFullYear(),now.getMonth()+offset,1);end=date(start.getFullYear(),start.getMonth()+1,0);}
    else{start=date(now.getFullYear()+offset,0,1);end=date(start.getFullYear(),11,31);}
    const days=[];for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1))days.push(new Date(d));
    return {start,end,days};
  }
  function model(sessions,{scale='week',offset=0,now=new Date(),weekly=15,goal=true}={}){
    if(!['week','month','year'].includes(scale))scale='week';
    offset=Math.min(0,Math.max(-100,Number.isFinite(offset)?Math.trunc(offset):0));
    const todayKey=key(now),daily=new Map();
    for(const session of sessions){
      if(!parse(session.date)||session.date>todayKey||!Number.isFinite(session.minutes)||session.minutes<=0)continue;
      const item=daily.get(session.date)||{minutes:0,count:0};item.minutes+=session.minutes;item.count++;daily.set(session.date,item);
    }
    const period=bounds(scale,offset,now),previous=bounds(scale,offset-1,now);
    const days=period.days.map(d=>({date:d,key:key(d),future:key(d)>todayKey,minutes:daily.get(key(d))?.minutes||0,count:daily.get(key(d))?.count||0}));
    const observed=days.filter(d=>!d.future),total=observed.reduce((n,d)=>n+d.minutes,0),average=observed.length?total/observed.length:0;
    const compared=previous.days.slice(0,Math.min(observed.length,previous.days.length));
    const previousTotal=compared.reduce((n,d)=>n+(daily.get(key(d))?.minutes||0),0),previousAverage=compared.length?previousTotal/compared.length:0;
    const active=observed.filter(d=>d.minutes>0).length,best=Math.max(0,...observed.map(d=>d.minutes));
    const dailyGoal=Math.round(Math.max(1,Math.min(168,Number(weekly)||15))*60/7);
    const ceiling=Math.max(60,best,goal?dailyGoal:0),roughStep=ceiling/4,magnitude=10**Math.floor(Math.log10(roughStep));
    const step=[1,2,2.5,5,10].map(n=>n*magnitude).find(n=>n>=roughStep)||10*magnitude,maximum=step*4;
    const x=i=>LEFT+i/(days.length-1||1)*(RIGHT-LEFT),y=m=>BASE-m/maximum*(BASE-TOP);
    const points=days.map((d,i)=>({...d,x:x(i),y:y(d.minutes)}));
    const rangeLabel=scale==='year'?String(period.start.getFullYear()):scale==='month'?period.start.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}):`${shortDate(period.start)} — ${shortDate(period.end)} ${period.end.getFullYear()}`;
    const ticks=scale==='week'?points.map((p,i)=>({index:i,label:p.date.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')})):scale==='month'?[1,5,10,15,20,25,days.length].filter((d,i,a)=>d<=days.length&&a.indexOf(d)===i).map(d=>({index:d-1,label:String(d).padStart(2,'0')})):points.flatMap((p,i)=>p.date.getDate()===1?[{index:i,label:p.date.toLocaleDateString('pt-BR',{month:'short'}).replace('.','')}]:[]);
    return {scale,offset,days:points,observed:observed.length,total,average,active,best,dailyGoal,maximum,step,
      rangeLabel,todayKey,percentage:previousAverage?Math.round((average/previousAverage-1)*100):null,
      comparison:`Média diária comparada aos primeiros ${compared.length} dias do período anterior. Dias futuros não entram na média.`,
      ticks,start:period.start,end:period.end,referenceY:y(dailyGoal),todayMinutes:daily.get(todayKey)?.minutes||0};
  }
  function linePath(points){return points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');}
  function remember(){try{localStorage.setItem(preferenceKey,JSON.stringify({scale:state.scale,goal:state.goal}));}catch{}}
  function selectedText(day){return `${fullDate(day.date)}. ${day.future?'Dia futuro.':duration(day.minutes)+'. '+day.count+' '+(day.count===1?'sessão salva.':'sessões salvas.')}`;}
  function caption(day,m){if(day.future)return 'Um novo ponto para desenhar.';if(!day.minutes)return 'Nenhuma sessão salva neste dia.';if(day.minutes===m.best)return '✦ Seu melhor dia neste período';return `${day.count} ${day.count===1?'sessão salva':'sessões salvas'}`;}
  function render(sessions,weekly=15){
    source=sessions;weeklyGoal=weekly;
    const m=current=model(sessions,{...state,weekly});
    let selected=m.days.findIndex(d=>d.key===state.selected);
    if(selected<0)selected=Math.max(0,m.days.findLastIndex(d=>!d.future));
    state.selected=m.days[selected].key;
    const day=m.days[selected],past=m.days.filter(d=>!d.future),path=linePath(past);
    const area=past.length?`${path} L${past.at(-1).x},${BASE} L${past[0].x},${BASE} Z`:'';
    const futureStart=past.length<m.days.length?(m.days[Math.max(0,past.length-1)].x+m.days[past.length].x)/2:null;
    const delta=m.percentage===null?'Seu tempo está virando história.':`${m.percentage>0?'↗':m.percentage<0?'↘':'→'} ${Math.abs(m.percentage)}% ${m.percentage<0?'a menos':'a mais'} na média diária`;
    const motivation=state.offset!==0?'Cada ponto guarda um dia da sua jornada.':!m.todayMinutes?'Seu próximo ponto começa com uma sessão de foco.':m.todayMinutes>=m.dailyGoal?'Referência de hoje alcançada. Agora é construir constância.':`Hoje você já somou ${duration(m.todayMinutes)}. Cada sessão faz essa curva crescer.`;
    const label={week:'Semana',month:'Mês',year:'Ano'},currentLabel={week:'Esta semana',month:'Este mês',year:'Este ano'};
    return `<section class="card full study-card" id="study-chart" aria-labelledby="study-title" data-scale="${state.scale}">
      <header class="study-header"><div><div class="section-label">Sua evolução, dia após dia</div><h2 id="study-title">Seu ritmo de estudo<span aria-hidden="true">✦</span></h2><p>Cada sessão desenha o seu próximo avanço.</p></div>
      <div class="study-scales" role="group" aria-label="Escala do gráfico">${['week','month','year'].map(s=>`<button type="button" data-study-scale="${s}" aria-pressed="${state.scale===s}">${label[s]}</button>`).join('')}</div></header>
      <div class="study-metrics"><div class="study-total"><span>Horas no período</span><div><strong data-study-total>${Math.floor(m.total/60)}<em>h</em> ${String(Math.round(m.total%60)).padStart(2,'0')}<em>min</em></strong></div><small title="${escape(m.comparison)}">${delta}</small></div>
      <div class="study-metric"><span>Média por dia</span><strong data-study-average>${duration(m.average)}</strong><small>nos ${m.observed} dias decorridos</small></div>
      <div class="study-metric"><span>Melhor dia</span><strong data-study-best>${duration(m.best)}</strong><small>sua marca neste período</small></div>
      <div class="study-metric"><span>Dias em movimento</span><strong data-study-active>${m.active}<em> / ${m.observed}</em></strong><small>cada retorno conta</small></div></div>
      <div class="study-toolbar"><div class="study-navigation" role="group" aria-label="Navegar entre períodos"><button type="button" data-study-action="previous" aria-label="${label[state.scale]} anterior" ${state.offset<=-100?'disabled':''}>‹</button><h3>${escape(m.rangeLabel)}</h3><button type="button" data-study-action="next" aria-label="Próximo período" ${state.offset>=0?'disabled':''}>›</button></div><button type="button" class="study-current" data-study-action="current" ${state.offset===0?'disabled':''}>${currentLabel[state.scale]}</button></div>
      <div class="study-inspector"><div><span data-study-date>${escape(fullDate(day.date))}</span><small data-study-caption>${caption(day,m)}</small></div><strong data-study-value>${day.future?'—':duration(day.minutes)}</strong></div>
      <div class="study-visual"><div class="study-y-axis" aria-hidden="true">${Array.from({length:5},(_,i)=>`<span style="top:${(TOP+i*(BASE-TOP)/4)/HEIGHT*100}%">${hours(m.maximum-i*m.step)}</span>`).join('')}</div>
      <div class="study-plot" role="slider" tabindex="0" aria-label="Horas estudadas por dia. Use as setas para explorar as datas." aria-orientation="horizontal" aria-valuemin="0" aria-valuemax="${m.days.length-1}" aria-valuenow="${selected}" aria-valuetext="${escape(selectedText(day))}">
      <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs><linearGradient id="study-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity=".32"/><stop offset="100%" stop-color="var(--accent)" stop-opacity=".015"/></linearGradient><linearGradient id="study-stroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="var(--accent)"/><stop offset="100%" stop-color="var(--accent2)"/></linearGradient></defs>
        ${Array.from({length:5},(_,i)=>`<line class="study-grid" x1="0" x2="1000" y1="${TOP+i*(BASE-TOP)/4}" y2="${TOP+i*(BASE-TOP)/4}"/>`).join('')}
        ${futureStart!==null?`<rect class="study-future" x="${futureStart}" y="0" width="${WIDTH-futureStart}" height="${HEIGHT}"/>`:''}
        ${state.goal?`<line class="study-goal-line" x1="0" x2="1000" y1="${m.referenceY}" y2="${m.referenceY}"/>`:''}
        <path class="study-area" d="${area}" fill="url(#study-area)"/>
        <path class="study-line-glow" d="${path}" fill="none" stroke="url(#study-stroke)" vector-effect="non-scaling-stroke"/>
        <path class="study-line" d="${path}" fill="none" stroke="url(#study-stroke)" vector-effect="non-scaling-stroke" pathLength="1"/>
        ${past.length<=31?past.filter(p=>p.minutes>0).map(p=>`<line class="study-day-mark" x1="${p.x}" x2="${p.x}" y1="${BASE}" y2="${p.y}" vector-effect="non-scaling-stroke"/>`).join(''):''}
        <line class="study-selection" data-study-guide x1="${day.x}" x2="${day.x}" y1="0" y2="${BASE}" vector-effect="non-scaling-stroke"/>
      </svg><span class="study-dot ${day.future?'hidden':''}" data-study-dot style="left:${day.x/WIDTH*100}%;top:${day.y/HEIGHT*100}%"></span>
      ${!m.total?'<div class="study-empty"><span aria-hidden="true">✧</span><strong>Sua próxima sessão vira um ponto aqui.</strong><p>Os dias sem registro ficam em zero. Seu progresso começa no seu ritmo.</p></div>':''}</div>
      <div class="study-x-axis" aria-hidden="true">${m.ticks.map((t,i)=>`<span class="${state.scale==='year'&&i%2===1?'study-alternate-label':''}" style="left:${m.days[t.index].x/WIDTH*100}%;transform:translateX(${i===0?'0':i===m.ticks.length-1?'-100%':'-50%'})">${escape(t.label)}</span>`).join('')}</div></div>
      <div class="study-legend"><span><i class="study-legend-line"></i>Horas estudadas por dia</span><label><input type="checkbox" data-study-goal ${state.goal?'checked':''}><i class="study-legend-goal"></i>Referência diária · ${duration(m.dailyGoal)}<span class="study-sr-only">, calculada a partir de sua meta semanal de ${weekly} horas</span></label></div>
      <p class="study-hint">${state.scale==='year'?'Todos os dias do ano, ponto a ponto. ':''}Passe o cursor, toque ou use as setas no gráfico para explorar. Apenas sessões salvas entram no histórico.</p>
      <footer class="study-footer"><p><span aria-hidden="true">✦</span>${motivation}</p><button class="btn tiny" type="button" data-study-action="focus">${m.todayMinutes?'Continuar meu ritmo':'Criar meu próximo ponto'} →</button></footer>
    </section>`;
  }
  function updateSelection(index){
    if(!current)return;const card=document.getElementById('study-chart');if(!card)return;
    index=Math.min(current.days.length-1,Math.max(0,index));const day=current.days[index];state.selected=day.key;
    const plot=card.querySelector('.study-plot');plot.setAttribute('aria-valuenow',index);plot.setAttribute('aria-valuetext',selectedText(day));
    card.querySelector('[data-study-date]').textContent=fullDate(day.date);card.querySelector('[data-study-value]').textContent=day.future?'—':duration(day.minutes);card.querySelector('[data-study-caption]').textContent=caption(day,current);
    const guide=card.querySelector('[data-study-guide]');guide.setAttribute('x1',day.x);guide.setAttribute('x2',day.x);
    const dot=card.querySelector('[data-study-dot]');dot.classList.toggle('hidden',day.future);dot.style.left=day.x/WIDTH*100+'%';dot.style.top=day.y/HEIGHT*100+'%';
  }
  function repaint(focusSelector){const card=document.getElementById('study-chart');if(!card)return;card.outerHTML=render(source,weeklyGoal);if(focusSelector)document.querySelector(focusSelector)?.focus({preventScroll:true});}
  document.addEventListener('click',event=>{
    const scale=event.target.closest('[data-study-scale]');if(scale){state.scale=scale.dataset.studyScale;state.offset=0;state.selected=null;remember();repaint(`[data-study-scale="${state.scale}"]`);return;}
    const action=event.target.closest('[data-study-action]');if(!action||action.disabled)return;
    if(action.dataset.studyAction==='focus'){window.go?.('timer');return;}
    if(action.dataset.studyAction==='previous')state.offset=Math.max(-100,state.offset-1);
    if(action.dataset.studyAction==='next')state.offset=Math.min(0,state.offset+1);
    if(action.dataset.studyAction==='current')state.offset=0;
    state.selected=null;repaint(`[data-study-action="${action.dataset.studyAction}"]`);
  });
  document.addEventListener('change',event=>{if(!event.target.matches('[data-study-goal]'))return;state.goal=event.target.checked;remember();repaint('[data-study-goal]');});
  function point(event){
    const plot=event.target.closest('.study-plot');if(!plot||!current)return;
    const box=plot.getBoundingClientRect(),x=(event.clientX-box.left)/box.width*WIDTH;
    updateSelection(Math.round((x-LEFT)/(RIGHT-LEFT)*(current.days.length-1)));
  }
  document.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')point(event);});
  document.addEventListener('pointerdown',point);
  document.addEventListener('keydown',event=>{
    if(!event.target.matches('.study-plot')||!current)return;
    const index=Number(event.target.getAttribute('aria-valuenow'));
    const next={ArrowLeft:index-1,ArrowDown:index-1,ArrowRight:index+1,ArrowUp:index+1,Home:0,End:current.days.length-1,PageUp:index+7,PageDown:index-7}[event.key];
    if(next===undefined)return;event.preventDefault();updateSelection(next);
  });
  window.StudyChart=Object.freeze({render,model});
})();
