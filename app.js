
const KEY = 'orbita2data';
const accountContext={user:null,storageKey:KEY,ready:true,onSave:null,onStorage:null};
const defaults = {name:'', theme:'cosmos', radius:20, density:1, weekly:15,
  fontSize:15, accent:'', accent2:'', background:'glow', backgroundStrength:60, fontFamily:'modern', cardStyle:'soft', motion:true, focusMinutes:25,
  subjects:[], tasks:[], sessions:[], courses:[], notes:[], agenda:[], focus:null};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2,11);
const localDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today = () => localDate(new Date());
const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s+'T12:00:00')) && localDate(new Date(s+'T12:00:00')) === s;
const color = s => typeof s === 'string' && /^#[\da-f]{6}$/i.test(s);
const bounded = (n,min,max,fallback) => Number.isFinite(Number(n)) ? Math.max(min,Math.min(max,Number(n))) : fallback;
const cleanId = s => typeof s === 'string' && /^[\w-]{1,80}$/.test(s) ? s : id();
const studyLinks=o=>Object.fromEntries(['courseId','lessonId','taskId','agendaId'].filter(k=>typeof o?.[k]==='string'&&/^[\w-]{1,80}$/.test(o[k])).map(k=>[k,o[k]]));
const text = (s, length=10000) => typeof s === 'string' ? s.slice(0,length) : '';
function normalizeData(raw, strict=false) {
  if(!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Formato inválido');
  const data = {...defaults};
  for(const k of ['subjects','tasks','sessions','courses','notes']) {
    if(strict && !Array.isArray(raw[k])) throw Error('Lista ausente: '+k);
    if(raw[k] !== undefined && (!Array.isArray(raw[k]) || raw[k].length > 20000)) throw Error('Lista inválida');
    data[k] = (raw[k] || []).map(item => {
      if(!item || typeof item !== 'object' || Array.isArray(item)) throw Error('Registro inválido');
      const base = {id:cleanId(item.id),...studyLinks(item)};
      if(k==='subjects') return {...base,name:text(item.name,80)||'Matéria',color:color(item.color)?item.color:'#aa95ff'};
      const subject = typeof item.subject==='string' && /^[\w-]{0,80}$/.test(item.subject) ? item.subject : '';
      if(k==='sessions') {
        if(!validDate(item.date) || !Number.isFinite(item.minutes) || item.minutes<1 || item.minutes>100000) throw Error('Sessão inválida');
        return {...base,subject,date:item.date,minutes:Math.round(item.minutes),kind:text(item.kind,160),agendaDate:validDate(item.agendaDate)?item.agendaDate:''};
      }
      if(k==='tasks') return {...base,subject,references:TaskBoard.normalizeReferences(item.references),title:text(item.title,160)||'Tarefa',done:item.done===true,priority:['Alta','Normal','Baixa'].includes(item.priority)?item.priority:'Normal',due:validDate(item.due)?item.due:''};
      if(k==='notes') return {...base,subject,title:text(item.title,160)||'Anotação',body:text(item.body,100000),date:validDate(item.date)?item.date:today()};
      if(!Array.isArray(item.lessons) || item.lessons.length>500) throw Error('Aulas inválidas');
      return {...base,subject,title:text(item.title,160)||'Curso',url:text(item.url,2048),playlistId:/^[\w-]{10,100}$/.test(item.playlistId||'')?item.playlistId:'',lessons:item.lessons.map(l=>{
        if(!l || typeof l!=='object') throw Error('Aula inválida');
        return {id:cleanId(l.id),title:text(l.title,160)||'Aula',done:l.done===true,videoId:/^[\w-]{11}$/.test(l.videoId||'')?l.videoId:''};
      })};
    });
    if(new Set(data[k].map(x=>x.id)).size!==data[k].length) throw Error('Identificadores repetidos');
  }
  data.agenda=Agenda.normalize(raw.agenda);
  data.name=text(raw.name,40); data.theme=text(raw.theme,30)||'cosmos';
  data.radius=bounded(raw.radius??20,8,32,20); data.density=bounded(raw.density??1,.8,1.2,1);
  data.weekly=bounded(raw.weekly??15,1,168,15); data.fontSize=bounded(raw.fontSize??15,14,18,15);
  data.accent=color(raw.accent)?raw.accent:''; data.accent2=color(raw.accent2)?raw.accent2:'';
  data.background=['glow','stars','plain','mesh','grid','dots','waves','orbit'].includes(raw.background)?raw.background:'glow';
  data.backgroundStrength=bounded(raw.backgroundStrength??60,0,100,60);
  data.fontFamily=['modern','humanist','serif','mono'].includes(raw.fontFamily)?raw.fontFamily:'modern';
  data.cardStyle=raw.cardStyle==='solid'?'solid':'soft';
  data.motion=raw.motion!==false; data.focusMinutes=bounded(raw.focusMinutes??25,1,180,25);
  const f=raw.focus;
  if(f && typeof f==='object') data.focus={
    ...studyLinks(f),agendaDate:validDate(f.agendaDate)?f.agendaDate:'',elapsed:bounded(f.elapsed??0,0,31536000,0),started:bounded(f.started??0,0,Date.now(),0),
    subject:typeof f.subject==='string'&&/^[\w-]{0,80}$/.test(f.subject)?f.subject:'',
    kind:text(f.kind,160)||'Leitura teórica',mode:f.mode==='focus'?'focus':'free',
    duration:bounded(f.duration??data.focusMinutes*60,60,10800,1500)
  };
  return data;
}
let db, storageWarning='';
try { db=normalizeData(JSON.parse(localStorage.getItem(KEY)||'{}')); }
catch { db=structuredClone(defaults); storageWarning='Não foi possível carregar seus dados. O conteúdo original foi mantido no navegador. Importe um backup para recuperar.'; }
let page='home', ticking=null;
let focus=db.focus||{elapsed:0,started:0,subject:'',kind:'Leitura teórica',mode:'free',duration:db.focusMinutes*60};
let started=focus.started, elapsed=focus.elapsed;
let storageBlocked=!!storageWarning;
function persist() {
  if(!accountContext.ready)return false;
  db.focus={...focus,started,elapsed};
  if(storageBlocked) {notice(storageWarning,9000);return false;}
  try {localStorage.setItem(accountContext.storageKey,JSON.stringify(db));accountContext.onSave?.();return true;}
  catch {notice('Não foi possível salvar no navegador. Exporte um backup para proteger suas alterações.',9000);return false;}
}
function save(){persist();render();}
let toastTimeout;
function notice(message,duration=3500){const el=$('#toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.add('hidden'),duration);}
const mins=n=>Math.round(n/60);
const fmt=n=>{n=Math.max(0,Math.round(Number(n)||0));return `${Math.floor(n/60)}h ${String(n%60).padStart(2,'0')}min`;};
const sub=i=>db.subjects.find(s=>s.id===i)?.name||'Geral';
const opts=(selected='')=>`<option value="" ${!selected||!db.subjects.some(s=>s.id===selected)?'selected':''}>Geral / sem matéria</option>`+db.subjects.map(s=>`<option value="${esc(s.id)}" ${s.id===selected?'selected':''}>${esc(s.name)}</option>`).join('');
const sum=a=>a.reduce((x,y)=>x+y,0);
const total=()=>sum(db.sessions.map(s=>s.minutes));
const thisWeek=()=>{const start=new Date();start.setDate(start.getDate()-(start.getDay()+6)%7);const end=new Date(start);end.setDate(start.getDate()+7);const a=localDate(start),b=localDate(end);return sum(db.sessions.filter(s=>s.date>=a&&s.date<b).map(s=>s.minutes));};
const pct=(n,d)=>d?Math.min(100,Math.round(100*n/d)):0;
const prog=n=>`<div class="progress" role="progressbar" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="100"><div style="width:${Math.min(100,Math.max(0,n))}%"></div></div>`;
const empty=s=>`<div class="empty">${s}</div>`;
const tabs=[['home','⌂','Visão geral'],['agenda','▦','Agenda'],['timer','◷','Foco'],['tasks','☑','Tarefas'],['courses','▶','Cursos'],['subjects','◈','Matérias'],['notes','✎','Notas'],['config','⚙','Ajustes']];
function go(p){if(!tabs.some(t=>t[0]===p))return;page=p;render();window.scrollTo({top:0,behavior:db.motion?'smooth':'instant'});}
function nav(){
  $('#nav').innerHTML=tabs.map(([k,i,n])=>`<button class="${page===k?'active':''}" ${page===k?'aria-current="page"':''} onclick="go('${k}')"><span aria-hidden="true">${i}</span> ${n}</button>`).join('');
  const bar=$('#mobilebar'), scroll=bar.scrollLeft;
  bar.innerHTML=tabs.map(([k,i,n])=>`<button class="${page===k?'active':''}" ${page===k?'aria-current="page"':''} onclick="go('${k}')"><b aria-hidden="true">${i}</b>${k==='home'?'Início':n}</button>`).join('');
  bar.setAttribute('aria-label','Navegação principal');bar.scrollLeft=scroll;
  if(window.matchMedia('(max-width:750px)').matches) requestAnimationFrame(()=>bar.querySelector('.active')?.scrollIntoView({block:'nearest',inline:'nearest'}));
}

const themes={cosmos:['#0a0e1c','#151a2d','#202741','#f4f5ff','#a0a9c5','#303852','#aa95ff','#70e4d1'],aurora:['#071c20','#102a30','#1a3940','#e8ffff','#a4c4c6','#2b5259','#67e8cf','#c5a7ff'],sunset:['#24131e','#351d2b','#462a38','#fff2ef','#e3b9c6','#654355','#ffae85','#ffd17a'],paper:['#f4f2ed','#ffffff','#eae7df','#242838','#687084','#d7d6d0','#7666cb','#368d8a'],ocean:['#071625','#10263b','#1c3850','#e9f6ff','#a2bfd0','#30536b','#66b8ff','#6de5d2'],forest:['#0c1916','#182a24','#263c32','#edf9ed','#b2c9b9','#395347','#a4d87b','#e7c58e']};function render(){applyTheme();nav();let heads={home:['Seu espaço para evoluir.','Um panorama da sua jornada acadêmica.'],agenda:['Seu tempo, com intenção.','Planeje a semana e encontre o próximo passo do seu dia.'],timer:['Entre em órbita.','Concentre-se no que importa agora.'],tasks:['Cada passo conta.','Transforme planos em progresso.'],courses:['Sua biblioteca de cursos.','Acompanhe cada aula, no seu ritmo.'],subjects:['Seu mapa de matérias.','Organize as áreas que você explora.'],notes:['Caderno de bordo.','Registre descobertas, ideias e dúvidas.'],config:['Seu universo, suas regras.','Personalize o Órbita do seu jeito.']};$('#heading').textContent=heads[page][0];$('#subtitle').textContent=heads[page][1];$('#greeting').textContent=db.name?`OLÁ, ${db.name.toUpperCase()}`:'CENTRO DE CONTROLE';$('#sections').innerHTML=({home,agenda,timer,tasks,courses,subjects,notes,config})[page]();if(page==='timer')refreshTimer();window.orbitaAuth?.decorate();}
function orderedTasks(items){return [...items].sort((a,b)=>Number(a.done)-Number(b.done)||(a.due||'9999').localeCompare(b.due||'9999')||({Alta:0,Normal:1,Baixa:2}[a.priority||'Normal']-({Alta:0,Normal:1,Baixa:2}[b.priority||'Normal'])));}
function dateLabel(value){return validDate(value)?new Date(value+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}):'';}
function home(){
  const week=thisWeek(), pending=orderedTasks(db.tasks.filter(t=>!t.done)), due=pending.filter(t=>t.due&&t.due<=today());
  const done=db.tasks.filter(t=>t.done).length;
  const todayMinutes=sum(db.sessions.filter(s=>s.date===today()).map(s=>s.minutes));
  const first=pending[0],nextLesson=CourseLibrary.next();
  return `<div class="grid">
    <div class="card full hero-card"><div class="section-label">${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</div>
    <h2>${started?'Sua sessão está em andamento.':due.length?'Um passo de cada vez. Comece por aqui.':'Seu próximo avanço começa hoje.'}</h2>
    <p>${started?'Seu tempo continua contando enquanto você organiza seus estudos.':first?`Próxima tarefa: <strong>${esc(first.title)}</strong>${first.due?' · '+dateLabel(first.due):''}.`:nextLesson?`Continue de onde parou: <strong>${esc(nextLesson.c.title)}</strong> · ${esc(CourseLibrary.lessonName(nextLesson.l,nextLesson.i))}.`:'Organize suas matérias, escolha uma tarefa e reserve um momento para aprender.'}</p>
    <button class="btn" ${!started&&!first&&nextLesson?`data-course-action="study" data-ci="${nextLesson.c.id}" data-li="${nextLesson.l.id}"`:`onclick="go('${started?'timer':first?'tasks':db.subjects.length?'timer':'subjects'}')"`}>${started?'Voltar à sessão →':first?'Organizar minhas tarefas →':nextLesson?'Continuar meu curso →':db.subjects.length?'Começar uma sessão →':'Adicionar minha primeira matéria →'}</button>
    <div class="metric-row"><span><strong>${fmt(todayMinutes)}</strong> hoje</span><span><strong>${due.length}</strong> ${due.length===1?'tarefa para hoje ou atrasada':'tarefas para hoje ou atrasadas'}</span><span><strong>${db.subjects.length}</strong> ${db.subjects.length===1?'matéria':'matérias'}</span></div></div>
    ${StudyChart.render(db.sessions,db.weekly)}
    <div class="card"><small>Tempo de estudo acumulado</small><div class="stat">${fmt(total())}</div><p class="small-text">Cada sessão conta na sua jornada.</p></div>
    <div class="card"><small>Meta desta semana</small><div class="stat">${fmt(week)}</div>${prog(pct(week,db.weekly*60))}<small>${pct(week,db.weekly*60)}% de ${db.weekly}h · segunda a domingo</small></div>
    <div class="card"><small>Tarefas concluídas</small><div class="stat">${done}<span class="muted-text" style="font-size:18px"> / ${db.tasks.length}</span></div>${prog(pct(done,db.tasks.length))}<small>Abra espaço para o próximo passo.</small></div>

    <div class="card"><h2>Tempo por matéria</h2>${db.subjects.length?db.subjects.map(s=>({s,m:sum(db.sessions.filter(x=>x.subject===s.id).map(x=>x.minutes))})).sort((a,b)=>b.m-a.m).slice(0,4).map(({s,m})=>`<div class="subject-row"><div class="row between"><span>${esc(s.name)}</span><small>${fmt(m)}</small></div>${prog(pct(m,total()))}</div>`).join(''):empty('Cadastre suas matérias para acompanhar sua dedicação.')}</div>
    <div class="card wide"><div class="row between"><h2>Suas próximas tarefas</h2><button class="btn tiny ghost" onclick="go('tasks')">Ver todas →</button></div>${taskList(pending.slice(0,5),false)}</div>
  </div>`;
}

function taskList(arr,actions=true){return arr.length?`<div class="list">${arr.map(t=>{
  const overdue=!t.done&&t.due&&t.due<today(), isToday=!t.done&&t.due===today();
  return `<div class="item ${overdue?'task-overdue':isToday?'task-today':''}"><input aria-label="${t.done?'Reabrir':'Concluir'}: ${esc(t.title)}" class="check" type="checkbox" ${t.done?'checked':''} onchange="toggleTask('${t.id}')"><div class="details" style="${t.done?'opacity:.6;text-decoration:line-through':''}"><strong>${esc(t.title)}</strong><small>${esc(sub(t.subject))} · ${esc(t.priority||'Normal')}${t.due?` · <span class="${overdue?'overdue-label':''}">${overdue?'Atrasada · ':isToday?'Hoje · ':''}${dateLabel(t.due)}</span>`:''}</small></div>${!t.done?CourseLibrary.taskAction(t):''}${actions?`<button class="btn tiny ghost" onclick="editTask('${t.id}')">Editar</button><button aria-label="Excluir tarefa: ${esc(t.title)}" class="btn tiny danger" onclick="remove('tasks','${t.id}')">×</button>`:''}</div>`;
}).join('')}</div>`:empty('Tudo em dia por aqui. Adicione uma tarefa para planejar seu próximo passo.')}

function tasks(){return TaskBoard.render();}
function editTask(i){TaskBoard.edit(i);}
function toggleTask(i){const t=db.tasks.find(t=>t.id===i);if(t){t.done=!t.done;CourseLibrary.markFromTask(t);}save();}

const studyKinds=['Leitura teórica','Exercícios','Videoaula','Revisão','Grupo de estudos','Pesquisa'];
function timer(){return `<div class="grid"><div class="card wide"><div class="row between"><h2>Seu momento de foco</h2><span class="pill" id="status">Pronto para começar</span></div>
  ${Agenda.focusContext()}${TaskBoard.focusContext()}${CourseLibrary.focusContext()}<div class="segmented"><button class="btn tiny ghost ${focus.mode==='free'?'selected':''}" aria-pressed="${focus.mode==='free'}" onclick="setFocusMode('free')">Cronômetro livre</button><button class="btn tiny ghost ${focus.mode==='focus'?'selected':''}" aria-pressed="${focus.mode==='focus'}" onclick="setFocusMode('focus')">Bloco de foco · ${db.focusMinutes} min</button></div>
  <div class="timer" id="clock">00:00:00</div><div class="timer-caption">${focus.mode==='focus'?'Tempo restante. Ao terminar, salve a sessão e faça uma pausa.':'No seu ritmo. Pause quando precisar.'}</div>
  <div class="form"><label>Matéria<select id="timersub" class="field" onchange="updateFocus('subject',this.value)">${opts(focus.subject)}</select></label><label>Atividade<select id="timerkind" class="field" onchange="updateFocus('kind',this.value)">${studyKinds.map(k=>`<option ${focus.kind===k?'selected':''}>${k}</option>`).join('')}</select></label></div>
  <div class="row" style="justify-content:center;margin-top:24px"><button class="btn" id="startbtn" onclick="startPause()">▶ Iniciar</button><button class="btn ghost" onclick="finishTimer()">Salvar sessão</button><button class="btn ghost" onclick="resetTimer()">Zerar</button></div>
  <p class="small-text" style="text-align:center;margin-top:18px">A sessão é preservada ao navegar ou recarregar esta página.</p></div>
  <div class="card"><h2>Registro manual</h2><p class="small-text" style="margin-bottom:16px">Estudou longe daqui? Seu esforço também conta.</p><form class="form" onsubmit="manualSession(event)"><label class="span">Matéria<select class="field" name="subject">${opts()}</select></label><label>Minutos<input class="field" name="minutes" type="number" min="1" max="1440" step="1" required placeholder="60"></label><label>Data<input class="field" name="date" type="date" max="${today()}" value="${today()}" required></label><label class="span">Atividade<input class="field" name="kind" maxlength="160" placeholder="Ex.: Exercícios da aula"></label><button class="btn span">Registrar tempo</button></form></div>
  <div class="card full"><h2>Histórico de sessões</h2>${db.sessions.length?`<div class="list">${[...db.sessions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,100).map(s=>`<div class="item"><div class="details"><strong>${esc(sub(s.subject))} · ${fmt(s.minutes)}</strong><small>${dateLabel(s.date)} · ${esc(s.kind||'Estudo')}</small>${CourseLibrary.recordLink(s)}${TaskBoard.recordLink(s)}</div><button class="btn tiny danger" onclick="remove('sessions','${s.id}')">Excluir</button></div>`).join('')}</div>${db.sessions.length>100?'<p class="small-text">Exibindo 100 sessões mais recentes. O backup inclui todo o histórico.</p>':''}`:empty('Sua primeira sessão começa com um pequeno passo.')}</div></div>`;}
function seconds(){const value=elapsed+(started?Math.max(0,Math.floor((Date.now()-started)/1000)):0);return focus.mode==='focus'?Math.min(focus.duration,value):value;}
function updateFocus(key,value){if(key==='subject'&&(focus.courseId||focus.taskId||focus.agendaId)&&value!==focus.subject){if(seconds()){const field=$('#timersub');if(field)field.value=focus.subject;return notice('Salve ou zere a sessão antes de mudar a matéria da aula.');}delete focus.courseId;delete focus.lessonId;delete focus.taskId;delete focus.agendaId;delete focus.agendaDate;}focus[key]=value;persist();if(key==='subject')render();}
function refreshTimer(){
  let n=seconds();
  if(started&&focus.mode==='focus'&&n>=focus.duration){elapsed=focus.duration;started=0;persist();notice('Bloco concluído! Salve sua sessão e faça uma pausa.',7000);}
  const display=focus.mode==='focus'?Math.max(0,focus.duration-n):n;
  const el=$('#clock');if(el)el.textContent=[Math.floor(display/3600),Math.floor(display%3600/60),display%60].map(x=>String(x).padStart(2,'0')).join(':');
  const b=$('#startbtn');if(b){b.textContent=started?'Ⅱ Pausar':n?'▶ Continuar':'▶ Iniciar';b.disabled=focus.mode==='focus'&&n>=focus.duration;}
  const st=$('#status');if(st)st.textContent=started?'● Em foco':focus.mode==='focus'&&n>=focus.duration?'Bloco concluído':n?'Pausado':'Pronto para começar';
}
function startPause(){if(started){elapsed=seconds();started=0;}else{if(focus.mode==='focus'&&seconds()>=focus.duration)return;started=Date.now();}persist();refreshTimer();}
function resetTimer(){if(seconds()&&!confirm('Zerar o cronômetro sem salvar a sessão?'))return;started=0;elapsed=0;focus.duration=db.focusMinutes*60;persist();refreshTimer();}
function setFocusMode(mode){if(mode===focus.mode)return;if(seconds()&&!confirm('Trocar de modo e descartar o tempo desta sessão?'))return;started=0;elapsed=0;focus.mode=mode;focus.duration=db.focusMinutes*60;save();}
function finishTimer(){const duration=seconds();if(duration<10)return notice('Estude por pelo menos 10 segundos antes de salvar.');
  // Refresh shared data before committing so a second tab cannot save this session twice.
  try{const shared=JSON.parse(localStorage.getItem(accountContext.storageKey)||'{}');if(shared.focus&&JSON.stringify(shared.focus)!==JSON.stringify(db.focus)){notice('A sessão foi atualizada em outra aba. Recarregue para continuar.');return;}}catch{}
  db.sessions.push({id:id(),subject:focus.subject,kind:focus.kind,...studyLinks(focus),agendaDate:validDate(focus.agendaDate)?focus.agendaDate:'',date:today(),minutes:Math.max(1,Math.round(duration/60))});started=0;elapsed=0;focus.duration=db.focusMinutes*60;save();notice(focus.courseId?'Tempo salvo no gráfico e na matéria. Marque a aula como concluída quando terminar.':'Sessão registrada. Bom trabalho!',6000);}
function manualSession(e){e.preventDefault();const f=new FormData(e.target),minutes=Number(f.get('minutes')),date=f.get('date');if(!Number.isInteger(minutes)||minutes<1||minutes>1440||!validDate(date)||date>today())return notice('Informe uma duração e uma data válidas, até hoje.');db.sessions.push({id:id(),subject:f.get('subject'),minutes,date,kind:f.get('kind').trim()||'Estudo'});save();notice('Tempo registrado!');}

function agenda(){return Agenda.render();}
function courses(){return CourseLibrary.render();}
function safeURL(s){try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.href:'#';}catch{return '#';}}
function subjects(){return `<div class="grid"><div class="card"><h2>Nova matéria</h2><form class="form" onsubmit="addSubject(event)"><label class="span">Nome<input class="field" name="name" required maxlength="80" placeholder="Ex.: Cálculo, História ou Programação"></label><label>Cor<input class="field" name="color" type="color" value="#aa95ff"></label><button class="btn span">+ Adicionar matéria</button></form></div><div class="card wide"><h2>Matérias cadastradas</h2><div class="list">${db.subjects.length?'':empty('Nenhuma matéria cadastrada. Adicione sua primeira matéria acima.')}${db.subjects.map(s=>`<div class="item"><span style="width:13px;height:13px;border-radius:50%;background:${esc(s.color)}"></span><div class="details"><strong>${esc(s.name)}</strong><small>${fmt(sum(db.sessions.filter(x=>x.subject===s.id).map(x=>x.minutes)))}</small></div>${CourseLibrary.subjectActions(s.id)}<button class="btn tiny ghost" onclick="renameSubject('${s.id}')">Editar</button><button class="btn tiny danger" onclick="deleteSubject('${s.id}')">×</button></div>`).join('')}</div></div></div>`}function addSubject(e){e.preventDefault();const form=e.currentTarget||e.target;const name=form.querySelector('[name="name"]')?.value.trim();const color=form.querySelector('[name="color"]')?.value||'#aa95ff';if(!name)return notice('Digite o nome da matéria');if(db.subjects.some(s=>s.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))return notice('Essa matéria já existe');db.subjects.push({id:id(),name,color});save();notice('Matéria adicionada')}function renameSubject(i){let s=db.subjects.find(s=>s.id===i),v=prompt('Nome da matéria:',s.name);if(v?.trim()){s.name=v.trim();save()}}function deleteSubject(i){const subject=db.subjects.find(s=>s.id===i);if(!subject)return;if(confirm(`Excluir a matéria “${subject.name}”? Tarefas, sessões, notas e cursos serão mantidos em Geral.`)){for(const key of ['tasks','sessions','notes','courses'])for(const item of db[key])if(item.subject===i)item.subject='';if(focus.subject===i)focus.subject='';for(const b of db.agenda){if(b.subject===i)b.subject='';for(const e of b.exceptions)if(e.value?.subject===i)e.value.subject='';}db.subjects=db.subjects.filter(s=>s.id!==i);save();}}

function notes(){return `<div class="grid"><div class="card"><h2>Nova anotação</h2><form class="form" onsubmit="addNote(event)"><label class="span">Título<input class="field" name="title" required placeholder="Ex.: Ideia para demonstrar um teorema"></label><label class="span">Matéria<select class="field" name="subject">${opts()}</select></label><label class="span">Anotação<textarea class="field" name="body" required placeholder="Escreva sua ideia, dúvida, referência..."></textarea></label><button class="btn span">+ Salvar nota</button></form></div><div class="card wide"><h2>Caderno de bordo</h2><div class="list">${db.notes.length?[...db.notes].reverse().map(n=>`<div class="item"><div class="details"><strong>${esc(n.title)}</strong><small>${esc(sub(n.subject))} · ${esc(n.date)}</small>${CourseLibrary.recordLink(n)}<p style="white-space:pre-wrap;color:var(--text)">${esc(n.body)}</p></div><button class="btn tiny ghost" onclick="editNote('${n.id}')">Editar</button><button class="btn tiny danger" onclick="remove('notes','${n.id}')">×</button></div>`).join(''):empty('Anote aqui suas descobertas e dúvidas.')}</div></div></div>`}function addNote(e){e.preventDefault();let f=new FormData(e.target);if(!f.get('title').trim()||!f.get('body').trim())return notice('Preencha o título e a anotação');db.notes.push({id:id(),title:f.get('title').trim(),subject:f.get('subject'),body:f.get('body').trim(),date:today()});save()}function editNote(i){const n=db.notes.find(n=>n.id===i);if(!n)return;
  openEditor('Editar anotação',`<label class="span">Título<input class="field" name="title" required maxlength="160" value="${esc(n.title)}"></label><label class="span">Matéria<select class="field" name="subject">${opts(n.subject)}</select></label><label class="span">Anotação<textarea class="field" name="body" required>${esc(n.body)}</textarea></label>`,f=>{const title=f.get('title').trim(),body=f.get('body').trim();if(!title||!body)return false;Object.assign(n,{title,body,subject:f.get('subject')});return true;});
}

function config(){return `<div class="grid">${appearancePanel()}
  <div class="card"><h2>Seu perfil de estudos</h2><div class="setting-stack"><label>Como quer ser chamado?<input class="field" value="${esc(db.name)}" maxlength="40" onchange="db.name=this.value.trim();save()" placeholder="Seu nome"></label><label>Meta semanal em horas<input class="field" type="number" min="1" max="168" value="${db.weekly}" onchange="db.weekly=bounded(this.value,1,168,15);save()"></label><label>Bloco de foco em minutos<input class="field" type="number" min="1" max="180" step="1" value="${db.focusMinutes}" onchange="setFocusDuration(this.value)"></label><p class="small-text">A duração será usada no próximo bloco de foco.</p></div></div>
  <div class="card"><h2>Sua paleta pessoal</h2><p class="small-text">Escolha as duas cores que dão vida aos botões, gráficos e detalhes.</p><div class="setting-stack"><label>Cor de destaque<input class="field" type="color" value="${db.accent||themes[db.theme]?.[6]||'#aa95ff'}" onchange="db.accent=this.value;save()"></label><label>Cor complementar<input class="field" type="color" value="${db.accent2||themes[db.theme]?.[7]||'#70e4d1'}" onchange="db.accent2=this.value;save()"></label><button class="btn tiny ghost" onclick="db.accent='';db.accent2='';save()">Restaurar cores do tema</button><label>Estilo dos cartões<select aria-label="Estilo dos cartões" class="field" onchange="db.cardStyle=this.value;save()">${[['soft','Suave, com profundidade'],['solid','Sólido, sem sombras']].map(([k,n])=>`<option value="${k}" ${db.cardStyle===k?'selected':''}>${n}</option>`).join('')}</select></label><label class="switch-row">Animações suaves<input type="checkbox" ${db.motion?'checked':''} onchange="db.motion=this.checked;save()"></label></div></div>
  <div class="card"><h2>Conforto de leitura</h2><div class="setting-stack"><label>Estilo da fonte<select aria-label="Estilo da fonte" class="field" onchange="db.fontFamily=this.value;save()">${Object.entries(fontNames).map(([k,n])=>`<option value="${k}" ${db.fontFamily===k?'selected':''}>${n}</option>`).join('')}</select></label><label>Tamanho do texto · <output>${db.fontSize}px</output><input aria-label="Tamanho do texto" type="range" min="14" max="18" value="${db.fontSize}" oninput="previewSetting('fontSize',this.value);this.previousElementSibling.value=this.value+'px'" onchange="save()"></label><label>Arredondamento · <output>${db.radius}px</output><input aria-label="Arredondamento" type="range" min="8" max="32" value="${db.radius}" oninput="previewSetting('radius',this.value);this.previousElementSibling.value=this.value+'px'" onchange="save()"></label><label>Espaçamento<select class="field" onchange="db.density=Number(this.value);save()">${[[.8,'Compacto'],[1,'Confortável'],[1.2,'Amplo']].map(([k,n])=>`<option value="${k}" ${db.density===k?'selected':''}>${n}</option>`).join('')}</select></label><button class="btn tiny ghost" onclick="resetAppearance()">Restaurar aparência padrão</button></div></div>
  <div class="card wide"><h2>Seu histórico, sempre com você</h2><p>Os dados ficam neste navegador. Exporte um backup para guardar uma cópia ou transferir seus estudos para outro dispositivo.</p><div class="row" style="margin-top:20px"><button class="btn" onclick="exportData()">↓ Exportar backup</button><label class="btn ghost" style="cursor:pointer">↑ Importar backup<input type="file" accept=".json,application/json" hidden onchange="importData(event)"></label></div><p class="small-text" style="margin-top:18px">Importar um backup substitui os dados atuais após sua confirmação.</p></div>
  <div class="card"><h2>Sobre o Órbita</h2><p>Versão 2.1 · Seu universo de estudos.</p><p>Um espaço para disciplinas, projetos e descobertas — na universidade e além.</p><button class="btn tiny danger" style="margin-top:22px" onclick="clearData()">Apagar todos os dados</button></div></div>`;}

function exportData(){let b=new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='orbita-backup-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}async function importData(e){const file=e.target.files[0];if(!file)return;try{if(file.size>20*1024*1024)throw Error('Arquivo muito grande');const candidate=normalizeData(JSON.parse(await file.text()),true);candidate.focus=null;if(!confirm('Substituir seus dados atuais pelo backup? Exporte uma cópia antes se quiser manter o histórico atual.'))return;db=candidate;focus={elapsed:0,started:0,subject:'',kind:'Leitura teórica',mode:'free',duration:db.focusMinutes*60};started=0;elapsed=0;storageBlocked=false;save();notice('Backup importado!');}catch(err){notice('Não foi possível importar: '+err.message+'. Seus dados atuais foram mantidos.',7000);}finally{e.target.value='';}}

function remove(kind,i){if(confirm('Excluir este registro?')){db[kind]=db[kind].filter(x=>x.id!==i);save()}}















Object.assign(themes,{
  lavender:['#f3effc','#ffffff','#eae2f7','#302641','#706080','#d9cce9','#7151ae','#367e79'],
  rose:['#fff1f3','#fffafb','#f8e1e8','#492d38','#7d5a69','#e8c5d1','#a5446a','#397b77'],
  sand:['#f7f1e5','#fffdf7','#ede4d1','#3e3529','#786b54','#d9cbb0','#8b5d2e','#437970'],
  graphite:['#111315','#1c1f23','#282c32','#f2f3f5','#adb2bb','#3b414a','#c2b5ff','#90d9c5'],
  midnight:['#080f24','#101c38','#1b2b4b','#edf2ff','#a5b5d5','#2e436b','#97b5ff','#e6ba7f'],
  matcha:['#f0f3e7','#fafcf4','#e3ead7','#2b392b','#62725a','#c7d3b8','#52723c','#94703d'],
  espresso:['#201a18','#2c2421','#3c302b','#faf0e5','#cfb6a2','#5c493d','#e8b980','#c9d39b'],
  sakura:['#faf2f7','#fffcfe','#f0e2ed','#482f45','#785b72','#d9c4d3','#994878','#477569'],
  glacier:['#eef6fa','#fbfeff','#dfeef4','#203d4d','#526d7b','#bfd3df','#256a91','#427367'],
  peach:['#fff3e9','#fffcf8','#f5e3d4','#513828','#80624e','#dfc9b5','#9a5029','#477368'],
  plum:['#201628','#2c2037','#3d2e49','#f8edff','#c5afcf','#594266','#d4a0f5','#f1bd9d'],
  tide:['#0b2027','#142e36','#203e48','#eaf8fa','#a8c6ce','#385863','#83d6e4','#e8d29a'],
  terracotta:['#f5eee9','#fffcf8','#eaded3','#47352c','#786354','#d7c5b6','#96523f','#4b7063'],
  neon:['#10141b','#1b212c','#293241','#eff7ff','#afbfcd','#415069','#c3ed6e','#87c6ff']
});
const themeNames={cosmos:'Cosmos',aurora:'Aurora',sunset:'Pôr do sol',paper:'Papel',ocean:'Oceano',forest:'Floresta',lavender:'Lavanda',rose:'Rosé',sand:'Areia',graphite:'Grafite',midnight:'Meia-noite',matcha:'Matcha',espresso:'Café',sakura:'Sakura',glacier:'Geleira',peach:'Pêssego',plum:'Ameixa',tide:'Maré',terracotta:'Terracota',neon:'Neon'};
const fontNames={modern:'Moderna',humanist:'Acolhedora',serif:'Literária',mono:'Monoespaçada'};
const fontStacks={modern:'Inter,system-ui,-apple-system,"Segoe UI",sans-serif',humanist:'"Trebuchet MS","Segoe UI",sans-serif',serif:'Georgia,"Times New Roman",serif',mono:'"SFMono-Regular",Consolas,"Liberation Mono",monospace'};
const backgrounds={glow:'Brilho suave',stars:'Estrelas',plain:'Liso',mesh:'Nuvem de cores',grid:'Quadriculado',dots:'Papel pontilhado',waves:'Ondas',orbit:'Órbitas'};
const looks={library:{name:'Biblioteca',description:'Papel quente e leitura tranquila.',theme:'sand',background:'dots',fontFamily:'serif',radius:12},night:{name:'Observatório',description:'Uma noite de ideias e descobertas.',theme:'midnight',background:'stars',fontFamily:'modern',radius:24},garden:{name:'Jardim',description:'Tons naturais para respirar e focar.',theme:'matcha',background:'waves',fontFamily:'humanist',radius:24},studio:{name:'Estúdio',description:'Linhas limpas, energia para criar.',theme:'neon',background:'grid',fontFamily:'modern',radius:12}};
let themeFilter='all';
function filterThemes(value){themeFilter=['all','light','dark'].includes(value)?value:'all';render();}
function applyLook(key){const look=looks[key];if(!look)return;Object.assign(db,{theme:look.theme,background:look.background,fontFamily:look.fontFamily,radius:look.radius,accent:'',accent2:'',density:1,cardStyle:'soft',backgroundStrength:60});themeFilter='all';save();notice('Visual “'+look.name+'” aplicado. Ajuste os detalhes como preferir.');}
function appearancePanel(){const t=themes[db.theme]||themes.cosmos;return `<section class="card full appearance-intro"><div><div class="section-label">Um espaço que combina com você</div><h2>Encontre sua atmosfera.</h2><p>Do silêncio de uma biblioteca à energia de uma noite de ideias. Cada detalhe pode ser seu.</p><p class="small-text appearance-status">${themeNames[db.theme]||'Cosmos'} · ${backgrounds[db.background]} · ${fontNames[db.fontFamily]}</p></div><div class="appearance-live" aria-label="Prévia da sua aparência"><div class="appearance-live-top"><span>✦ Seu próximo capítulo</span><span class="pill">Seu ritmo</span></div><strong>Um pouco a cada dia.</strong><p>Seu espaço para aprender e crescer.</p><div class="progress"><div style="width:68%"></div></div><span class="appearance-sample-btn">Vamos começar →</span><small>As alterações são salvas automaticamente.</small></div></section>
<section class="card full"><div class="section-label">Comece por uma inspiração</div><h2>Um toque, um novo clima.</h2><div class="look-grid">${Object.entries(looks).map(([k,l])=>{const v=themes[l.theme];return `<button class="look-tile" onclick="applyLook('${k}')" aria-label="Aplicar visual ${l.name}"><span class="look-art ambient-pattern" data-background="${l.background}" style="--bg:${v[0]};--accent:${v[6]};--accent2:${v[7]};--muted:${v[4]}"><i style="background:${v[1]};color:${v[3]};font-family:${l.fontFamily==='serif'?'Georgia,serif':'inherit'}">Aa <b style="background:${v[6]}"></b></i></span><strong>${l.name}</strong><small>${l.description}</small></button>`;}).join('')}</div></section>
<section class="card full"><div class="row between"><div><div class="section-label">01 · Sua paleta</div><h2>Uma cor para cada fase.</h2></div><div class="appearance-filters" role="group" aria-label="Filtrar temas">${[['all','Todos'],['light','Claros'],['dark','Escuros']].map(([k,n])=>`<button class="btn tiny ghost" aria-pressed="${themeFilter===k}" onclick="filterThemes('${k}')">${n}</button>`).join('')}</div></div><div class="theme-grid">${Object.entries(themes).filter(([,v])=>themeFilter==='all'||(readableInk(v[0])==='#ffffff'?'dark':'light')===themeFilter).map(([k,v])=>`<button class="theme-tile" aria-label="Tema ${themeNames[k]}" aria-pressed="${db.theme===k}" onclick="setTheme('${k}')"><span class="palette-preview" style="--sample-bg:${v[0]};--sample-surface:${v[1]};--sample-accent:${v[6]};--sample-second:${v[7]}"><span><i></i><i></i><i></i></span></span><strong>${themeNames[k]}${db.theme===k?' ✓':''}</strong><small>${readableInk(v[0])==='#ffffff'?'Escuro':'Claro'}</small></button>`).join('')}</div><p class="small-text" style="margin-top:16px">Trocar de tema restaura suas duas cores. O fundo e os ajustes de leitura continuam como você escolheu.</p></section>
<section class="card full"><div class="section-label">02 · Seu cenário</div><h2>O fundo também faz parte.</h2><p class="small-text">Texturas leves que acompanham as cores do seu tema.</p><div class="background-grid">${Object.entries(backgrounds).map(([k,n])=>`<button class="background-tile" aria-label="Fundo ${n}" aria-pressed="${db.background===k}" onclick="db.background='${k}';save()"><span class="background-art ambient-pattern" data-background="${k}"></span><strong>${n}${db.background===k?' ✓':''}</strong></button>`).join('')}</div><div class="setting-stack"><label>Intensidade do fundo · <output>${db.backgroundStrength}%</output><input aria-label="Intensidade do fundo" type="range" min="0" max="100" step="5" value="${db.backgroundStrength}" ${db.background==='plain'?'disabled':''} oninput="previewSetting('backgroundStrength',this.value);this.previousElementSibling.value=this.value+'%'" onchange="save()"></label></div></section>`;}
function readableInk(hex){const rgb=hex.slice(1).match(/../g).map(v=>{const n=parseInt(v,16)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});const l=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];return (l+.05)/.05>=1.05/(l+.05)?'#000000':'#ffffff';}
function applyTheme(){const t=themes[db.theme]||themes.cosmos,root=document.documentElement;['bg','surface','surface2','text','muted','border','accent','accent2'].forEach((k,i)=>root.style.setProperty('--'+k,t[i]));if(color(db.accent))root.style.setProperty('--accent',db.accent);if(color(db.accent2))root.style.setProperty('--accent2',db.accent2);root.style.setProperty('--radius',db.radius+'px');root.style.setProperty('--density',db.density);root.style.setProperty('--font-size',db.fontSize+'px');root.style.setProperty('--font-family',fontStacks[db.fontFamily]||fontStacks.modern);root.style.setProperty('--background-opacity',db.backgroundStrength/100);root.style.setProperty('--button-ink',readableInk(db.accent||t[6]));root.style.setProperty('--accent-readable',accessibleAccent(db.accent||t[6],t));root.style.setProperty('--link-readable',accessibleAccent(db.accent2||t[7],t));document.body.dataset.background=db.background;document.body.dataset.cards=db.cardStyle;document.body.dataset.motion=db.motion?'on':'off';document.querySelector('meta[name="theme-color"]').content=t[0];root.style.colorScheme=readableInk(t[0])==='#ffffff'?'dark':'light';}
function accessibleAccent(hex,t){const luminance=c=>{const v=c.slice(1).match(/../g).map(x=>{const n=parseInt(x,16)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return .2126*v[0]+.7152*v[1]+.0722*v[2];},l=luminance(hex);return t.slice(0,3).every(c=>{const b=luminance(c);return (Math.max(l,b)+.05)/(Math.min(l,b)+.05)>=4.5;})?hex:t[3];}
function setTheme(t){if(!themes[t])return;db.theme=t;db.accent='';db.accent2='';save();}
function previewSetting(key,value){db[key]=Number(value);applyTheme();}
function setFocusDuration(value){db.focusMinutes=Math.round(bounded(value,1,180,25));if(!seconds())focus.duration=db.focusMinutes*60;save();}
function resetAppearance(){Object.assign(db,{theme:'cosmos',accent:'',accent2:'',radius:20,density:1,fontSize:15,fontFamily:'modern',background:'glow',backgroundStrength:60,cardStyle:'soft',motion:true});themeFilter='all';save();notice('Aparência restaurada.');}
let editorCommit=null, editorTrigger=null;
function openEditor(title,fields,commit){const dialog=$('#editor');editorTrigger=document.activeElement;editorCommit=commit;dialog.innerHTML=`<div class="editor-head"><h2 id="editor-title">${esc(title)}</h2><button class="btn tiny ghost" type="button" aria-label="Fechar edição" onclick="document.querySelector('#editor').close()">×</button></div><form id="editor-form"><div class="form">${fields}</div><div class="row dialog-actions"><button class="btn ghost" type="button" onclick="document.querySelector('#editor').close()">Cancelar</button><button class="btn" type="submit">Salvar alterações</button></div></form>`;dialog.showModal();$('#editor-form').addEventListener('submit',e=>{e.preventDefault();const result=editorCommit(new FormData(e.target));if(result!==true)return notice(typeof result==='string'?result:'Preencha os campos antes de salvar.');dialog.close();save();notice('Alterações salvas.');});}
function clearData(){if(!confirm(accountContext.user?'Apagar seus dados de estudo nesta conta e sincronizar a exclusão? Sua conta continuará existindo. Exporte um backup antes.':'Apagar todos os dados do Órbita neste navegador? Esta ação é irreversível.'))return;db=structuredClone(defaults);started=0;elapsed=0;focus={elapsed:0,started:0,subject:'',kind:'Leitura teórica',mode:'free',duration:1500};storageBlocked=false;save();notice('Dados apagados.');}
function initialize(){
  if(!themes[db.theme])db.theme='cosmos';
  $('#editor').addEventListener('close',()=>{editorCommit=null;if(editorTrigger?.isConnected)editorTrigger.focus();});
  render();refreshTimer();ticking=setInterval(refreshTimer,500);
  if(storageWarning)notice(storageWarning,12000);
  window.addEventListener('storage',event=>{if(event.key!==accountContext.storageKey)return;if(accountContext.onStorage){accountContext.onStorage(event);return;}try{db=normalizeData(JSON.parse(event.newValue||'{}'));focus=db.focus||{elapsed:0,started:0,subject:'',kind:'Leitura teórica',mode:'free',duration:db.focusMinutes*60};started=focus.started;elapsed=focus.elapsed;$('#editor').close();render();refreshTimer();}catch{notice('Os dados foram alterados em outra aba e não puderam ser carregados.');}});
}

if(!window.ORBITA_CONFIG?.enabled)initialize();document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshTimer()});
