/* Subject-based tasks, source references and study context. */
(() => {
 'use strict';
 const types={book:['▤','Livro'],lesson:['▷','Aula'],article:['▧','Artigo'],link:['↗','Link'],other:['✧','Outro']};
 let owner=null,filter='open',search='',subject='all',collapsed=new Set(),refSerial=0;
 const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
 function referenceURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}}
 function normalizeReferences(value){
  if(value==null)return [];if(!Array.isArray(value)||value.length>12)throw Error('Referências inválidas (máximo de 12 por tarefa)');
  return value.map(r=>{if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Referência inválida');return {type:Object.hasOwn(types,r.type)?r.type:'other',title:clean(r.title,160),detail:clean(r.detail,500),url:referenceURL(clean(r.url,2048))};}).filter(r=>r.title);
 }
 function reset(){owner=db;filter='open';search='';subject='all';collapsed=new Set();}
 function source(t){const c=db.courses.find(c=>c.id===t.courseId),l=c?.lessons.find(l=>l.id===t.lessonId);return c?{c,l}:null;}
 function references(t){
  const refs=normalizeReferences(t.references),origin=source(t);
  if(!refs.length&&!origin)return '';
  return `<div class="task-references" aria-label="Referências da tarefa">${origin?`<button class="task-reference task-source" data-course-action="open" data-ci="${origin.c.id}"><span aria-hidden="true">▷</span><span><small>AULA DO ÓRBITA</small><strong>${esc(origin.c.title)}</strong>${origin.l?`<em>${esc(origin.l.title)}</em>`:''}</span><b aria-hidden="true">↗</b></button>`:''}${refs.map(r=>{
   const tag=r.url?'a':'div',attrs=r.url?`href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"`:'';
   return `<${tag} class="task-reference" ${attrs}><span aria-hidden="true">${types[r.type][0]}</span><span><small>${types[r.type][1]}</small><strong>${esc(r.title)}</strong>${r.detail?`<em>${esc(r.detail)}</em>`:''}</span>${r.url?'<b aria-hidden="true">↗</b>':''}</${tag}>`;
  }).join('')}</div>`;
 }
 function card(t){
  const overdue=!t.done&&t.due&&t.due<today(),now=!t.done&&t.due===today(),time=sum(db.sessions.filter(s=>s.taskId===t.id).map(s=>s.minutes));
  return `<article class="task-card ${t.done?'is-done':''} ${overdue?'is-overdue':''}" data-task-id="${t.id}"><div class="task-card-top"><label class="task-title"><input class="check" type="checkbox" data-task-check="${t.id}" aria-label="${t.done?'Reabrir':'Concluir'}: ${esc(t.title)}" ${t.done?'checked':''}><strong>${esc(t.title)}</strong></label><div class="task-card-actions">${t.done?'':CourseLibrary.taskAction(t)}<button class="task-icon" data-task-action="edit" data-ti="${t.id}" aria-label="Editar tarefa: ${esc(t.title)}" title="Editar tarefa">✎</button><button class="task-icon" data-task-action="delete" data-ti="${t.id}" aria-label="Excluir tarefa: ${esc(t.title)}" title="Excluir tarefa">×</button></div></div><div class="task-meta"><span class="task-priority ${t.priority==='Alta'?'is-high':''}">${esc(t.priority||'Normal')}</span>${t.due?`<span class="task-due ${overdue?'is-late':now?'is-today':''}">${overdue?'Atrasada · ':now?'Hoje · ':''}${dateLabel(t.due)}</span>`:'<span>Sem prazo definido</span>'}${time?`<span>${fmt(time)} de foco</span>`:''}${t.done?'<span class="task-finished">✓ Concluída</span>':''}</div>${references(t)}</article>`;
 }
 function board(){
  const query=search.toLocaleLowerCase('pt-BR');
  const visible=db.tasks.filter(t=>{
   const sid=db.subjects.some(s=>s.id===t.subject)?t.subject:'';
   const origin=source(t),searchable=[t.title,sub(t.subject),origin?.c.title,origin?.l?.title,...normalizeReferences(t.references).flatMap(r=>[r.title,r.detail,r.type in types?types[r.type][1]:'',r.url])].join(' ').toLocaleLowerCase('pt-BR');
   return (subject==='all'||subject===sid)&&(!query||searchable.includes(query))&&(filter==='all'||(filter==='done'?t.done:filter==='today'?!t.done&&!!t.due&&t.due<=today():!t.done));
  });
  if(!visible.length)return `<div class="task-empty"><span aria-hidden="true">${db.tasks.length?'✓':'✧'}</span><h3>${db.tasks.length?'Tudo organizado por aqui.':'Seu próximo passo merece um lugar.'}</h3><p>${db.tasks.length?'Nenhuma tarefa corresponde a estes filtros. Você pode ver todas ou começar um novo plano.':'Crie uma tarefa, escolha a matéria e reúna as referências que vai usar para estudar.'}</p>${db.tasks.length?'<button class="btn tiny ghost" data-task-action="reset-filters">Ver todas as tarefas</button>':'<button class="btn" data-task-action="new">Criar minha primeira tarefa →</button>'}</div>`;
  const groups=[...db.subjects.map(s=>({id:s.id,name:s.name,color:s.color})),{id:'',name:'Geral / sem matéria',color:'var(--accent)'}];
  return groups.flatMap(s=>{const all=db.tasks.filter(t=>(db.subjects.some(v=>v.id===t.subject)?t.subject:'')===s.id),items=orderedTasks(visible.filter(t=>(db.subjects.some(v=>v.id===t.subject)?t.subject:'')===s.id));if(!items.length)return [];
   const done=all.filter(t=>t.done).length,closed=collapsed.has(s.id);
   return [`<section class="task-group" data-task-group="${s.id}" style="--subject-color:${s.color}" aria-label="Tarefas de ${esc(s.name)}"><header class="task-group-head"><button class="task-group-toggle" data-task-action="toggle-group" data-si="${s.id}" aria-expanded="${!closed}" aria-controls="task-group-${s.id||'general'}"><i aria-hidden="true"></i><span><strong>${esc(s.name)}</strong><small>${all.length-done} pendentes · ${done} de ${all.length} concluídas</small></span><b aria-hidden="true">${closed?'＋':'−'}</b></button><button class="btn tiny ghost" data-task-action="new" data-si="${s.id}" aria-label="Nova tarefa em ${esc(s.name)}">+ Tarefa</button></header><div class="task-group-progress" role="progressbar" aria-label="Progresso de ${esc(s.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct(done,all.length)}"><i style="width:${pct(done,all.length)}%"></i></div><div id="task-group-${s.id||'general'}" class="task-group-list" ${closed?'hidden':''}>${items.map(card).join('')}</div></section>`];
  }).join('');
 }
 function renderBoard(){
  if(owner!==db)reset();const pending=db.tasks.filter(t=>!t.done),due=pending.filter(t=>t.due&&t.due<=today()).length,done=db.tasks.length-pending.length;
  return `<div class="task-page"><section class="card task-hero"><div class="task-hero-top"><div><div class="section-label">CLAREZA PARA O PRÓXIMO PASSO</div><h2>Cada matéria, um caminho.</h2><p>Suas tarefas e referências juntas, prontas para virar estudo.</p></div><button class="btn" data-task-action="new">+ Nova tarefa</button></div><div class="task-stats"><div><strong>${pending.length}</strong><span>tarefas pendentes</span></div><div><strong>${due}</strong><span>para hoje ou atrasadas</span></div><div><strong>${done}</strong><span>tarefas concluídas</span></div></div></section><section class="task-workspace" aria-labelledby="task-board-title"><div class="task-board-heading"><div><div class="section-label">UM PASSO DE CADA VEZ</div><h2 id="task-board-title">Suas tarefas por matéria</h2></div><label class="task-search"><span class="study-sr-only">Buscar tarefas ou referências</span><input class="field" type="search" data-task-search placeholder="Buscar tarefa, livro ou aula…" value="${esc(search)}"></label></div><div class="task-toolbar"><div class="task-filters" role="group" aria-label="Filtrar tarefas">${[['open','Pendentes'],['today','Para hoje'],['all','Todas'],['done','Concluídas']].map(([key,name])=>`<button type="button" data-task-filter="${key}" aria-pressed="${filter===key}">${name}</button>`).join('')}</div><label class="task-subject-filter"><span class="study-sr-only">Filtrar por matéria</span><select class="field" data-task-subject-filter><option value="all">Todas as matérias</option>${db.subjects.map(s=>`<option value="${s.id}" ${subject===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}<option value="" ${subject===''?'selected':''}>Geral / sem matéria</option></select></label></div><div id="task-board" class="task-board">${board()}</div></section></div>`;
 }
 function refresh(){const el=document.getElementById('task-board');if(el)el.innerHTML=board();}
 function refFields(ref={type:'book',title:'',detail:'',url:''}){
  const n=refSerial++;
  return `<fieldset class="task-ref-editor" data-ref-row="${n}"><legend>Referência</legend><div class="task-ref-editor-head"><label>Tipo<select class="field" name="ref-type-${n}" data-ref-type>${Object.entries(types).map(([k,v])=>`<option value="${k}" ${ref.type===k?'selected':''}>${v[1]}</option>`).join('')}</select></label><button type="button" class="task-icon" data-task-action="remove-reference" aria-label="Remover referência" title="Remover referência">×</button></div><label>Nome da referência<input class="field" name="ref-title-${n}" required maxlength="160" placeholder="Ex.: Fundamentos de Física — Halliday" value="${esc(ref.title)}"></label><label>Capítulo, páginas ou observações<input class="field" name="ref-detail-${n}" maxlength="500" placeholder="Ex.: Capítulo 3 · páginas 40–52 · exercícios 1 a 8" value="${esc(ref.detail)}"></label><label>Link ${ref.type==='link'?'':'(opcional)'}<input class="field" name="ref-url-${n}" type="url" maxlength="2048" placeholder="https://..." ${ref.type==='link'?'required':''} value="${esc(ref.url)}" data-ref-url></label></fieldset>`;
 }
 function lessonOptions(ci,li){const c=db.courses.find(c=>c.id===ci);return '<option value="">Escolha uma aula</option>'+(c?.lessons||[]).map(l=>`<option value="${l.id}" ${li===l.id?'selected':''}>${esc(l.title)}</option>`).join('');}
 function edit(ti,si=''){
  if(!accountContext.ready)return;if(owner!==db)reset();const existing=db.tasks.find(t=>t.id===ti),context=db,t=existing||{title:'',subject:si,priority:'Normal',due:'',references:[]},origin=source(t);refSerial=0;
  const fields=`<label class="span">O que você precisa fazer?<input class="field" name="title" required maxlength="160" placeholder="Ex.: Resolver a lista de cinemática" value="${esc(t.title)}"></label><label>Matéria<select class="field" name="subject" data-task-editor-subject>${opts(t.subject)}</select></label><label>Prioridade<select class="field" name="priority">${['Normal','Alta','Baixa'].map(p=>`<option ${t.priority===p?'selected':''}>${p}</option>`).join('')}</select></label><label class="span">Prazo (opcional)<input class="field" type="date" name="due" value="${esc(t.due)}"></label><section class="span task-editor-sources"><div class="task-editor-section"><div><h3>Referências para estudar</h3><p>Livros, capítulos, aulas e links que você vai precisar.</p></div><button type="button" class="btn tiny ghost" data-task-action="add-reference">+ Referência</button></div><div id="task-reference-fields">${normalizeReferences(t.references).map(refFields).join('')}</div><p class="task-ref-help">Até 12 referências. Elas acompanham a tarefa durante o Foco.</p></section><details class="span task-course-picker" ${origin?'open':''}><summary>Vincular a uma aula do Órbita</summary><div class="form"><label class="span">Curso<select class="field" name="courseId" data-task-editor-course><option value="">Sem vínculo com curso</option>${db.courses.map(c=>`<option value="${c.id}" ${origin?.c.id===c.id?'selected':''}>${esc(c.title)}</option>`).join('')}</select></label><label class="span" data-task-lesson-label ${origin?'':'hidden'}>Aula<select class="field" name="lessonId" data-task-editor-lesson ${origin?'required':''}>${lessonOptions(t.courseId,t.lessonId)}</select></label><p class="span">Uma aula vinculada usa a matéria do curso. Ao concluir esta tarefa, a aula também será marcada como concluída.</p></div></details>`;
  openEditor(existing?'Editar tarefa':'Nova tarefa',fields,f=>{
   if(context!==db||!accountContext.ready||(existing&&!db.tasks.includes(existing)))return false;
   const title=String(f.get('title')||'').trim();if(!title)return false;
   const refs=[...document.querySelectorAll('#task-reference-fields [data-ref-row]')].map(row=>{const n=row.dataset.refRow;return {type:f.get('ref-type-'+n),title:f.get('ref-title-'+n),detail:f.get('ref-detail-'+n),url:f.get('ref-url-'+n)};});
   if(refs.some(r=>r.url&&!referenceURL(r.url)))return 'Use links completos, começando com https:// ou http://.';
   const course=db.courses.find(c=>c.id===f.get('courseId')),lesson=course?.lessons.find(l=>l.id===f.get('lessonId'));
   if(course&&!lesson)return 'Escolha uma aula do curso ou remova o vínculo.';
   const data={title,subject:course?course.subject:String(f.get('subject')||''),priority:String(f.get('priority')||'Normal'),due:String(f.get('due')||''),references:normalizeReferences(refs)};
   const target=existing||{id:id(),done:false};delete target.courseId;delete target.lessonId;if(course&&lesson){data.courseId=course.id;data.lessonId=lesson.id;}Object.assign(target,data);if(!existing)db.tasks.unshift(target);
   // Keep the group containing the saved task reachable under the current filters.
   collapsed.delete(target.subject);if(subject!=='all'&&subject!==target.subject)subject='all';if(search)search='';if(filter==='done'&&!target.done||filter==='today'&&(!target.due||target.due>today()))filter=target.done?'done':'open';
   return true;
  });
  document.getElementById('editor').classList.add('task-editor-dialog');updateRefButton();
 }
 function updateRefButton(){const b=document.querySelector('#editor [data-task-action="add-reference"]');if(b)b.disabled=document.querySelectorAll('#task-reference-fields [data-ref-row]').length>=12;}
 function focusTask(t){
  const origin=source(t),same=focus.taskId===t.id||(origin?.l&&focus.courseId===origin.c.id&&focus.lessonId===origin.l.id);
  if(seconds()&&!same){go('timer');return notice('Você já tem uma sessão em andamento. Salve ou zere antes de trocar de tarefa.',7000);}
  if(origin?.l){CourseLibrary.study(origin.c.id,origin.l.id);}else{delete focus.courseId;delete focus.lessonId;focus.subject=t.subject;focus.kind=normalizeReferences(t.references).some(r=>r.type==='book')?'Leitura teórica':normalizeReferences(t.references).some(r=>r.type==='lesson')?'Videoaula':'Exercícios';}
  focus.taskId=t.id;persist();go('timer');
 }
 function focusContext(){const t=db.tasks.find(t=>t.id===focus.taskId);if(!t)return '';const refs=references(t);if(focus.courseId&&!normalizeReferences(t.references).length)return '';return `<section class="task-focus-context"><div class="section-label">TAREFA EM FOCO</div><strong>${esc(t.title)}</strong>${refs}<div class="row"><button class="btn tiny ghost" data-task-action="complete-focus" data-ti="${t.id}" ${t.done?'disabled':''}>${t.done?'✓ Tarefa concluída':'Concluir tarefa'}</button><button class="task-context-button" data-task-action="back">Voltar às tarefas</button></div></section>`;}
 function recordLink(record){const t=db.tasks.find(t=>t.id===record.taskId);return t&&!record.courseId?`<button class="task-context-button" data-task-action="find" data-ti="${t.id}">↗ ${esc(t.title)}</button>`:'';}
 function openSubject(si){if(owner!==db)reset();subject=si;filter='open';search='';go('tasks');}
 document.addEventListener('input',e=>{if(e.target.matches('[data-task-search]')){search=e.target.value;refresh();}});
 document.addEventListener('change',e=>{
  if(!accountContext.ready)return;
  if(e.target.matches('[data-task-subject-filter]')){subject=e.target.value;refresh();}
  if(e.target.matches('[data-task-check]')){const i=e.target.dataset.taskCheck,done=e.target.checked;toggleTask(i);document.querySelector(`[data-task-check="${i}"]`)?.focus({preventScroll:true});notice(done?'Tarefa concluída! Você pode encontrá-la em Concluídas.':'Tarefa reaberta. Ela voltou para as pendentes.');}
  if(e.target.matches('[data-ref-type]')){const url=e.target.closest('[data-ref-row]').querySelector('[data-ref-url]');url.required=e.target.value==='link';}
  if(e.target.matches('[data-task-editor-course]')){const c=db.courses.find(c=>c.id===e.target.value),l=c?.lessons.find(l=>!l.done)||c?.lessons[0];const select=document.querySelector('[data-task-editor-lesson]');select.innerHTML=lessonOptions(c?.id,l?.id);select.required=!!c;document.querySelector('[data-task-lesson-label]').hidden=!c;if(c)document.querySelector('[data-task-editor-subject]').value=c.subject;}
  if(e.target.matches('[data-task-editor-subject]')){const select=document.querySelector('[data-task-editor-course]'),c=db.courses.find(c=>c.id===select.value);if(c&&c.subject!==e.target.value){select.value='';document.querySelector('[data-task-editor-lesson]').value='';document.querySelector('[data-task-editor-lesson]').required=false;document.querySelector('[data-task-lesson-label]').hidden=true;}}
 });
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-task-action]');if(!b||!accountContext.ready)return;const action=b.dataset.taskAction;
  if(action==='new'||action==='edit')return edit(b.dataset.ti,b.dataset.si||'');
  if(action==='delete')return remove('tasks',b.dataset.ti);
  if(action==='add-reference'){const holder=document.getElementById('task-reference-fields');if(holder&&holder.children.length<12){holder.insertAdjacentHTML('beforeend',refFields());updateRefButton();holder.lastElementChild.querySelector('input')?.focus();}return;}
  if(action==='remove-reference'){b.closest('[data-ref-row]')?.remove();updateRefButton();return;}
  if(action==='toggle-group'){if(collapsed.has(b.dataset.si))collapsed.delete(b.dataset.si);else collapsed.add(b.dataset.si);refresh();document.querySelector(`[data-task-action="toggle-group"][data-si="${b.dataset.si}"]`)?.focus({preventScroll:true});return;}
  if(action==='reset-filters'){filter='all';subject='all';search='';render();return;}
  if(action==='back')return go('tasks');
  if(action==='complete-focus'){const t=db.tasks.find(t=>t.id===b.dataset.ti);if(t&&!t.done){toggleTask(t.id);notice('Tarefa concluída! Mais um passo na sua jornada.');}return;}
  if(action==='find'){const t=db.tasks.find(t=>t.id===b.dataset.ti);if(t){if(owner!==db)reset();filter='all';subject=db.subjects.some(s=>s.id===t.subject)?t.subject:'';search='';collapsed.delete(subject);go('tasks');document.querySelector(`[data-task-id="${t.id}"]`)?.scrollIntoView({behavior:db.motion?'smooth':'instant',block:'center'});}return;}
 });
 document.addEventListener('click',e=>{const b=e.target.closest('[data-task-filter]');if(b&&accountContext.ready){filter=b.dataset.taskFilter;document.querySelectorAll('[data-task-filter]').forEach(el=>el.setAttribute('aria-pressed',el===b));refresh();}});
 document.addEventListener('close',e=>{if(e.target.id==='editor')e.target.classList.remove('task-editor-dialog');},true);
 window.TaskBoard=Object.freeze({render:renderBoard,edit,normalizeReferences,focusTask,focusContext,recordLink,openSubject});
})();
