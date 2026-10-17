/* Supabase Auth + account-scoped storage + versioned cloud synchronization. */
(() => {
  'use strict';
  const config=window.ORBITA_CONFIG;
  if(!config?.enabled)return;
  const state={client:null,user:null,epoch:0,mode:'login',recovery:false,busy:false,ready:false,
    revision:0,base:null,dirty:false,saving:false,status:'',conflict:null,importChoice:false,
    timer:null,poll:null,initialized:false,guest:false,pendingRestore:null};
  const lists=['subjects','tasks','sessions','courses','notes'];
  const authScreen=$('#auth-screen');
  const cacheKey=userId=>KEY+':user:'+userId;
  const metaKey=userId=>KEY+':sync:'+userId;
  const snapshot=()=>({...JSON.parse(JSON.stringify(db)),focus:null});
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const hasStudies=data=>lists.some(k=>data[k]?.length);
  const freshFocus=()=>({elapsed:0,started:0,subject:'',kind:'Leitura teórica',mode:'free',duration:db.focusMinutes*60});
  const readJson=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
  function readData(key){const raw=localStorage.getItem(key);return raw===null?null:JSON.parse(raw);}
  function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
  function meta(){return {revision:state.revision,base:state.base,dirty:state.dirty};}
  function storeMeta(){return state.user?writeJson(metaKey(state.user.id),meta()):false;}
  function setStatus(value){state.status=value;document.querySelectorAll('[data-sync-status]').forEach(el=>el.textContent=value);}
  function applyData(data,{keepTimer=false}={}){
    const oldFocus=focus,oldStarted=started,oldElapsed=elapsed;
    db=normalizeData(data,true);storageBlocked=false;storageWarning='';
    focus=keepTimer?oldFocus:(db.focus||freshFocus());
    started=keepTimer?oldStarted:focus.started;elapsed=keepTimer?oldElapsed:focus.elapsed;
    if(focus.subject&&!db.subjects.some(s=>s.id===focus.subject))focus.subject='';
    db.focus={...focus,started,elapsed};
    render();refreshTimer();
  }
  function storeAccount(){return writeJson(accountContext.storageKey,{...db,focus:{...focus,started,elapsed}});}
  function resetMemory(){db=structuredClone(defaults);focus=freshFocus();started=0;elapsed=0;storageBlocked=false;storageWarning='';$('#editor').close();page='home';}
  function clearWork(){state.epoch++;clearTimeout(state.timer);state.timer=null;clearInterval(state.poll);state.poll=null;state.saving=false;state.conflict=null;state.ready=false;state.importChoice=false;state.pendingRestore=null;accountContext.ready=false;accountContext.onSave=null;accountContext.onStorage=null;}
  function lock(){document.body.classList.add('auth-locked');authScreen.classList.remove('hidden');}
  function unlock(){document.body.classList.remove('auth-locked');authScreen.classList.add('hidden');authScreen.replaceChildren();}
  function message(value,tone='error'){const el=$('#auth-message');if(el){el.textContent=value;el.dataset.tone=tone;el.classList.remove('hidden');}}
  function errorMessage(error){
    const code=error?.code||'';
    if(code==='invalid_credentials'||/invalid login credentials/i.test(error?.message||''))return 'E-mail ou senha incorretos. Confira os dados e tente novamente.';
    if(code==='email_not_confirmed')return 'Confirme seu e-mail antes de entrar. Confira também a pasta de spam.';
    if(['over_email_send_rate_limit','over_request_rate_limit'].includes(code)||error?.status===429)return 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';
    if(code==='email_address_not_authorized'||/email address not authorized/i.test(error?.message||''))return 'O envio de e-mails ainda precisa ser configurado neste serviço. Tente novamente mais tarde.';
    if(code==='weak_password')return 'Escolha uma senha mais forte, com letras, números e pelo menos 10 caracteres.';
    if(code==='same_password')return 'Escolha uma senha diferente da anterior.';
    if(/fetch|network|timeout/i.test(error?.message||'')||!navigator.onLine)return 'Não foi possível conectar. Verifique sua conexão e tente novamente.';
    return 'Não foi possível concluir agora. Tente novamente em instantes.';
  }
  function passwordField(name,label,confirm=false){return `<label>${label}<span class="password-field"><input class="field" name="${name}" type="password" required ${state.mode==='login'?'':'minlength="10"'} maxlength="128" autocomplete="${state.mode==='login'?'current-password':'new-password'}" ${confirm?'':'autocapitalize="off"'}><button class="password-toggle" type="button" data-show-password="${name}" aria-label="Mostrar ${confirm?'confirmação da senha':'senha'}" aria-pressed="false">Mostrar</button></span></label>`;}
  function showAuth(mode='login',feedback=''){
    state.mode=mode;lock();
    const recovery=mode==='update', signup=mode==='signup', forgot=mode==='forgot', loading=mode==='loading';
    const titles={login:'Bom ter você por aqui.',signup:'Sua jornada começa aqui.',forgot:'Vamos recuperar seu acesso.',update:'Escolha sua nova senha.',loading:'Preparando seu espaço…'};
    const subtitles={login:'Entre para continuar de onde parou.',signup:'Crie sua conta e leve seus estudos com você.',forgot:'Enviaremos um link para redefinir sua senha.',update:'Use uma senha que você ainda não utiliza em outros serviços.',loading:'Conectando seus estudos à sua conta.'};
    authScreen.innerHTML=`<div class="auth-layout"><div class="auth-intro"><div class="brand">✧ órbita<i>.</i><small>SEU UNIVERSO DE ESTUDOS</small></div><h1>Seu esforço merece um lugar para crescer.</h1><p>Organize a rotina, encontre seu foco e acompanhe cada conquista.</p><div class="auth-points"><span><b aria-hidden="true">◈</b> Suas matérias e projetos, juntos.</span><span><b aria-hidden="true">◷</b> Um espaço para estudar no seu ritmo.</span><span><b aria-hidden="true">✦</b> Seus estudos no celular e no computador.</span></div></div><section class="auth-card" aria-labelledby="auth-title"><h2 id="auth-title">${titles[mode]}</h2><p>${subtitles[mode]}</p>${loading?'':`<form id="auth-form">${signup?'<label>Como quer ser chamado?<input class="field" name="name" maxlength="40" autocomplete="given-name" placeholder="Seu nome"></label>':''}${!recovery?'<label>E-mail<input class="field" name="email" type="email" required maxlength="254" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="voce@exemplo.com"></label>':''}${!forgot?passwordField('password',recovery?'Nova senha':'Senha'):''}${signup||recovery?passwordField('confirm','Confirme a senha',true):''}<button class="btn" type="submit">${signup?'Criar minha conta':forgot?'Enviar link de recuperação':recovery?'Salvar nova senha':'Entrar na minha conta'}</button></form>`}<div id="auth-message" class="auth-message hidden" role="status" aria-live="polite"></div>${loading?'':`<div class="auth-meta">${mode==='login'?'<button class="link-button" type="button" data-auth-mode="forgot">Esqueci minha senha</button><p>Ainda não tem uma conta? <button class="link-button" type="button" data-auth-mode="signup">Criar conta</button></p>':recovery?'<button class="link-button" type="button" data-auth-action="logout">Sair desta conta</button>':'<button class="link-button" type="button" data-auth-mode="login">← Voltar para entrar</button>'}${!recovery?'<button class="link-button" type="button" data-auth-action="guest">Continuar sem conta neste dispositivo</button>':''}</div>`}</section></div>`;
    $('#auth-form')?.addEventListener('submit',submitAuth);
    if(feedback)message(feedback,'success');
    if(!loading)requestAnimationFrame(()=>$('#auth-form input')?.focus());
  }
  async function submitAuth(event){
    event.preventDefault();if(state.busy)return;
    const form=event.currentTarget,values=new FormData(form),mode=state.mode;
    const email=String(values.get('email')||'').trim(),password=String(values.get('password')||'');
    if((mode==='signup'||mode==='update')&&password!==values.get('confirm'))return message('As senhas não coincidem. Digite a mesma senha nos dois campos.');
    state.busy=true;const button=form.querySelector('[type=submit]'),oldText=button.textContent;button.disabled=true;button.textContent='Um instante…';
    try{
      if(mode==='login'){
        const {data,error}=await state.client.auth.signInWithPassword({email,password});if(error)throw error;
        await activate(data.user);
      }else if(mode==='signup'){
        const {data,error}=await state.client.auth.signUp({email,password,options:{data:{name:String(values.get('name')||'').trim()},emailRedirectTo:config.siteUrl}});if(error)throw error;
        form.reset();if(data.session)await activate(data.user);else showAuth('login','Confira seu e-mail para confirmar a conta. Depois, volte para entrar. Se já tiver uma conta, use seu acesso ou recupere a senha.');
      }else if(mode==='forgot'){
        const url=new URL(config.siteUrl);url.searchParams.set('auth','recovery');
        const {error}=await state.client.auth.resetPasswordForEmail(email,{redirectTo:url.href});if(error)throw error;
        form.reset();message('Se existir uma conta com esse e-mail, você receberá um link de recuperação. Abra o link neste mesmo navegador.','success');
      }else if(mode==='update'){
        if(!state.user)throw Error('No session');const {error}=await state.client.auth.updateUser({password});if(error)throw error;
        state.recovery=false;sessionStorage.removeItem('orbita-recovery');history.replaceState(null,'',location.pathname);form.reset();unlock();render();notice('Senha atualizada. Você já pode continuar seus estudos.');
      }
    }catch(error){message(errorMessage(error));}
    finally{state.busy=false;if(button.isConnected){button.disabled=false;button.textContent=oldText;}}
  }
  function localChanged(){
    if(!state.user||!state.ready)return;
    state.dirty=!equal(snapshot(),state.base);if(!storeMeta())return setStatus('Backup local indisponível');
    if(state.conflict){decorate();return;}
    if(state.dirty){setStatus(navigator.onLine?'Alterações para salvar':'Sem conexão · salvo aqui');clearTimeout(state.timer);state.timer=setTimeout(sync,750);}
  }
  async function getRemote(userId){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{const {data,error}=await state.client.from('planner_documents').select('payload,revision,updated_at').eq('user_id',userId).abortSignal(controller.signal).maybeSingle();if(error)throw error;return data;}finally{clearTimeout(timer);}
  }
  function safeRemote(row){return row?{...row,payload:{...normalizeData(row.payload,true),focus:null}}:null;}
  function conflict(remote){state.conflict=remote;setStatus('Há duas versões para revisar');decorate();}
  async function activate(user){
    if(!user?.id)return;
    if(state.user?.id===user.id&&state.ready){if(state.recovery)showAuth('update');return;}
    if(state.user?.id===user.id&&state.loading)return;
    clearWork();const epoch=state.epoch;state.loading=true;state.user=user;state.guest=false;
    accountContext.user=user;accountContext.storageKey=cacheKey(user.id);resetMemory();showAuth('loading');
    const cachedMeta=readJson(metaKey(user.id));
    let local=null;try{const cached=readData(cacheKey(user.id));if(cached)local=normalizeData(cached,true);}catch{state.pendingRestore='invalid-cache';}
    state.revision=Number.isSafeInteger(cachedMeta?.revision)?cachedMeta.revision:0;
    state.base=cachedMeta?.base||null;
    if(local)applyData(local);state.dirty=local?!equal(snapshot(),state.base):false;
    try{
      const remote=safeRemote(await getRemote(user.id));if(epoch!==state.epoch)return;
      if(remote){
        if(state.pendingRestore==='invalid-cache'){
          if(!writeJson(KEY+':damaged-cache:'+user.id+':'+Date.now(),localStorage.getItem(cacheKey(user.id))))throw Error('Cannot preserve cache');
          state.pendingRestore=null;
        }
        if(state.dirty&&!equal(snapshot(),remote.payload))conflict(remote);
        else{applyData(remote.payload,{keepTimer:!!local});state.revision=remote.revision;state.base=remote.payload;state.dirty=false;}
      }else if(!local&&!state.pendingRestore){
        db=structuredClone(defaults);db.name=text(user.user_metadata?.name,40);focus=freshFocus();started=0;elapsed=0;state.base=null;state.revision=0;state.dirty=true;
      }else if(local){state.revision=0;state.base=null;state.dirty=true;}
      setStatus(state.conflict?'Há duas versões para revisar':state.dirty?'Alterações para salvar':'Sincronizado');
    }catch(error){if(epoch!==state.epoch)return;setStatus('Sem conexão · tente sincronizar');if(!local){state.pendingRestore='load-failed';state.dirty=false;}}
    if(epoch!==state.epoch)return;
    state.loading=false;state.ready=true;accountContext.ready=!state.pendingRestore;
    accountContext.onSave=localChanged;accountContext.onStorage=handleCacheChange;
    if(!state.pendingRestore){storeAccount();storeMeta();}
    const legacy=readJson(KEY);state.importChoice=hasStudies(legacy||{})&&localStorage.getItem(KEY+':imported:'+user.id)!=='yes';
    if(state.recovery)showAuth('update');else unlock();
    render();refreshTimer();
    state.poll=setInterval(()=>{if(document.visibilityState==='visible')sync();},20000);
    if(state.dirty&&!state.conflict&&!state.pendingRestore)sync();
  }
  async function sync(){
    if(!state.user||!state.ready||state.saving||state.conflict||state.pendingRestore||state.recovery)return;
    if(!navigator.onLine){setStatus(state.dirty?'Sem conexão · salvo aqui':'Sem conexão');return;}
    const epoch=state.epoch,userId=state.user.id;state.saving=true;
    try{
      const remote=safeRemote(await getRemote(userId));if(epoch!==state.epoch)return;
      // Another tab may have persisted a newer local revision while the request was in flight.
      const shared=readJson(metaKey(userId));if(shared&&shared.revision>state.revision&&!state.dirty){state.revision=shared.revision;state.base=shared.base;}
      if(remote&&remote.revision!==state.revision){
        if(state.dirty&&!equal(snapshot(),remote.payload)){conflict(remote);return;}
        if(!state.dirty&&$('#editor').open){setStatus('Há uma atualização · feche a edição para receber');return;}
        state.revision=remote.revision;state.base=remote.payload;
        if(!state.dirty){applyData(remote.payload,{keepTimer:true});storeAccount();}
        else state.dirty=false;
        storeMeta();
      }
      if(!state.dirty){setStatus('Sincronizado');return;}
      const payload=snapshot();setStatus('Salvando…');
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
      let result;
      try{
        let request=state.client.from('planner_documents');
        request=state.revision?request.update({payload}).eq('user_id',userId).eq('revision',state.revision):request.insert({user_id:userId,payload});
        result=await request.select('revision,updated_at').abortSignal(controller.signal).maybeSingle();
      }finally{clearTimeout(timeout);}
      if(epoch!==state.epoch)return;
      if(result.error||!result.data){
        if(result.error?.code==='23505'||(!result.error&&!result.data)){const newer=safeRemote(await getRemote(userId));if(epoch!==state.epoch)return;if(newer){conflict(newer);return;}}
        throw result.error||Error('Write failed');
      }
      state.revision=result.data.revision;state.base=payload;state.dirty=!equal(snapshot(),payload);storeMeta();
      setStatus(state.dirty?'Alterações para salvar':'Sincronizado');
    }catch(error){if(epoch!==state.epoch)return;setStatus(error?.status===401?'Entre novamente para sincronizar':'Falha ao sincronizar · salvo aqui');}
    finally{if(epoch===state.epoch){state.saving=false;if(state.dirty&&!state.conflict&&!state.pendingRestore&&navigator.onLine){clearTimeout(state.timer);state.timer=setTimeout(sync,12000);}}}
  }
  function decorate(){
    if(!state.initialized)return;
    let controls=$('#account-controls');if(!controls){controls=document.createElement('div');controls.id='account-controls';controls.className='account-controls';document.querySelector('.top').append(controls);}
    controls.innerHTML=state.user?`<span class="sync-status" data-sync-status role="status">${esc(state.status)}</span><button class="btn tiny ghost" data-account-action="account">Minha conta</button>`:'<button class="btn tiny" data-account-action="login">Entrar / criar conta</button>';
    const foot=document.querySelector('.sidebar-foot');if(foot)foot.innerHTML='✦ Um pequeno avanço, todos os dias.<br><br>'+ (state.user?'Sua conta, seu universo.':'Dados salvos neste navegador.');
    $('#cloud-banner')?.remove();
    if(state.user&&(state.pendingRestore||state.conflict||state.importChoice)){
      const banner=document.createElement('section');banner.id='cloud-banner';banner.className='account-banner';banner.setAttribute('aria-live','polite');
      if(state.pendingRestore)banner.innerHTML='<h2>Vamos recuperar seus estudos com cuidado.</h2><p>Não foi possível carregar seu histórico com segurança. A edição está pausada para preservar os dados existentes.</p><div class="row"><button class="btn tiny" data-account-action="retry">Tentar carregar novamente</button><button class="btn tiny ghost" data-account-action="logout">Sair</button></div>';
      else if(state.conflict)banner.innerHTML='<h2>Você tem alterações em dois lugares.</h2><p>Seus estudos foram modificados em outro dispositivo. Escolha qual versão continuar usando. As duas serão guardadas em um backup neste navegador antes de substituir qualquer versão.</p><div class="row"><button class="btn tiny" data-account-action="use-cloud">Usar versão da nuvem</button><button class="btn tiny ghost" data-account-action="use-local">Manter esta versão</button><button class="btn tiny ghost" data-account-action="export">Exportar versão deste dispositivo</button></div>';
      else banner.innerHTML='<h2>Seus estudos já estavam por aqui?</h2><p>Encontramos dados salvos neste navegador. Você pode adicioná-los à sua conta. Seus registros na nuvem serão preservados, e a cópia original continuará neste dispositivo.</p><div class="row"><button class="btn tiny" data-account-action="import-local">Adicionar meus estudos à conta</button><button class="btn tiny ghost" data-account-action="dismiss-import">Agora não</button></div>';
      $('#sections').prepend(banner);
    }
    if(state.pendingRestore){$('#sections').querySelectorAll('.grid input,.grid button,.grid select,.grid textarea,.course-page input,.course-page button,.course-page select,.course-page textarea').forEach(el=>el.disabled=true);}
    $('#account-card')?.remove();
    if(page==='config'&&state.user){
      const card=document.createElement('section');card.id='account-card';card.className='card account-card full';card.innerHTML=`<h2>Sua conta</h2><p class="account-email">${esc(state.user.email||'')}</p><p>Seu planner é sincronizado entre seus dispositivos. O cronômetro em andamento fica neste dispositivo.</p><div class="row" style="margin-top:16px"><button class="btn tiny ghost" data-account-action="sync">Sincronizar agora</button><button class="btn tiny ghost" data-account-action="export">Exportar meus dados</button><button class="btn tiny ghost" data-account-action="logout">Sair da conta</button></div>`;$('#sections>.grid')?.prepend(card);
      const dataHeading=[...$('#sections').querySelectorAll('h2')].find(el=>el.textContent==='Seu histórico, sempre com você');
      if(dataHeading){dataHeading.nextElementSibling.textContent='Seus dados são salvos na sua conta. Você também pode exportar uma cópia de segurança ou importar um backup.';}
    }
  }
  function backupVersions(remote){const key=KEY+':conflict:'+state.user.id+':'+Date.now();return writeJson(key,{local:snapshot(),cloud:remote.payload,createdAt:new Date().toISOString()});}
  async function resolveConflict(choice){
    if(!state.conflict||!state.user)return;const remote=state.conflict;
    if(!backupVersions(remote))return notice('Não há espaço para guardar as duas versões. Exporte seus dados antes de continuar.',7000);
    if(choice==='local'&&!confirm('Manter os dados deste dispositivo e substituir a versão na nuvem? Uma cópia das duas versões foi guardada neste navegador.'))return;
    state.revision=remote.revision;state.base=remote.payload;state.conflict=null;
    if(choice==='cloud'){applyData(remote.payload,{keepTimer:true});state.dirty=false;storeAccount();}else state.dirty=true;
    storeMeta();render();sync();
  }
  function importLocal(){
    if(!state.user||state.conflict||state.pendingRestore)return;
    let source;try{source=normalizeData(readJson(KEY),true);}catch{return notice('Não foi possível ler os dados antigos. Importe um backup JSON em Ajustes.');}
    // Remap conflicting IDs across the complete import, preserving subject relationships.
    const remap=new Map(),merged=JSON.parse(JSON.stringify(db));
    for(const item of source.subjects){const existing=merged.subjects.find(s=>s.id===item.id);if(existing&&equal(existing,item)){remap.set(item.id,existing.id);continue;}const copy={...item,id:existing?id():item.id};remap.set(item.id,copy.id);merged.subjects.push(copy);}
    const courseRemap=new Map();
    for(const item of source.courses){const copy={...item,subject:remap.get(item.subject)||''};const existing=merged.courses.find(x=>x.id===copy.id);if(existing&&equal(existing,copy)){courseRemap.set(item.id,existing.id);continue;}if(existing)copy.id=id();courseRemap.set(item.id,copy.id);merged.courses.push(copy);}
    for(const key of ['tasks','sessions','notes'])for(const item of source[key]){const copy={...item,subject:remap.get(item.subject)||''};if(copy.courseId)copy.courseId=courseRemap.get(copy.courseId)||copy.courseId;const existing=merged[key].find(x=>x.id===copy.id);if(existing&&equal(existing,copy))continue;if(existing)copy.id=id();merged[key].push(copy);}
    if(!db.name)merged.name=source.name;
    applyData(merged,{keepTimer:true});if(!persist())return;
    localStorage.setItem(KEY+':imported:'+state.user.id,'yes');state.importChoice=false;render();notice('Estudos adicionados à conta. A cópia original foi preservada.');
  }
  function handleCacheChange(){
    if(!state.user||!state.ready)return;const raw=readJson(accountContext.storageKey);if(!raw)return;
    try{
      const local=normalizeData(raw,true),metaOther=readJson(metaKey(state.user.id));
      if($('#editor').open){setStatus('Outra aba mudou os dados · feche a edição e recarregue');return;}
      if(state.saving||state.dirty){const candidate={...local,focus:null};if(!equal(snapshot(),candidate))return setStatus('Outra aba mudou os dados · sincronize para revisar');}
      applyData(local);if(metaOther){state.revision=metaOther.revision||0;state.base=metaOther.base||null;}state.dirty=!equal(snapshot(),state.base);decorate();
    }catch{setStatus('Falha ao ler alterações de outra aba');}
  }
  async function guest(){
    if(state.user)return;
    clearWork();state.guest=true;accountContext.user=null;accountContext.storageKey=KEY;
    try{applyData(normalizeData(readData(KEY)||{},false));}catch{return showAuth('login','Não foi possível ler os estudos locais. O conteúdo original foi preservado. Entre em sua conta para continuar.');}
    accountContext.ready=true;unlock();render();
  }
  async function logout(){
    if(state.dirty&&!confirm('Ainda há alterações não sincronizadas. Elas ficarão guardadas neste navegador para esta conta. Deseja sair?'))return;
    state.signingOut=true;clearWork();state.user=null;state.guest=false;state.recovery=false;accountContext.user=null;accountContext.storageKey=KEY;resetMemory();showAuth('loading');render();
    sessionStorage.removeItem('orbita-recovery');
    try{const {error}=await state.client.auth.signOut({scope:'local'});if(error)throw error;}
    catch{state.client.auth.stopAutoRefresh();localStorage.removeItem('orbita-auth-v1');}
    finally{state.signingOut=false;showAuth('login');}
  }
  async function retry(){const user=state.user;if(!user)return;state.user=null;await activate(user);}
  function click(event){
    const mode=event.target.closest('[data-auth-mode]');if(mode){showAuth(mode.dataset.authMode);return;}
    const toggle=event.target.closest('[data-show-password]');if(toggle){const input=$('#auth-form').elements[toggle.dataset.showPassword];const show=input.type==='password';input.type=show?'text':'password';toggle.textContent=show?'Ocultar':'Mostrar';toggle.setAttribute('aria-pressed',String(show));return;}
    const target=event.target.closest('[data-account-action],[data-auth-action]');if(!target)return;
    const action=target.dataset.accountAction||target.dataset.authAction;
    if(action==='login')showAuth('login');else if(action==='guest')guest();else if(action==='logout')logout();
    else if(action==='account')go('config');else if(action==='sync')sync();else if(action==='retry')retry();
    else if(action==='export')exportData();else if(action==='use-cloud')resolveConflict('cloud');else if(action==='use-local')resolveConflict('local');
    else if(action==='import-local')importLocal();else if(action==='dismiss-import'){localStorage.setItem(KEY+':imported:'+state.user.id,'yes');state.importChoice=false;render();}
  }
  async function boot(){
    lock();resetMemory();state.initialized=true;initialize();document.addEventListener('click',click);showAuth('loading');
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl)||!/^sb_publishable_/.test(config.supabasePublishableKey)||!window.supabase?.createClient){showAuth('login');$('#auth-form').querySelector('[type=submit]').disabled=true;return message('O acesso à conta está temporariamente indisponível. Você pode continuar sem conta neste dispositivo.');}
    state.client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'orbita-auth-v1'}});
    accountContext.ready=false;
    state.client.auth.onAuthStateChange((event,session)=>{
      // Never await Supabase operations inside this callback (Auth lock).
      if(event==='PASSWORD_RECOVERY'){state.recovery=true;sessionStorage.setItem('orbita-recovery','yes');}
      if(event==='SIGNED_OUT'){
        if(state.signingOut)return;
        clearWork();state.user=null;accountContext.user=null;resetMemory();showAuth('login');render();return;
      }
      if(session?.user){const epoch=state.epoch;setTimeout(()=>{if(epoch===state.epoch&&!state.signingOut)activate(session.user);},0);}
    });
    try{
      const {data,error}=await state.client.auth.getSession();if(error)throw error;
      if(data.session){const verified=await state.client.auth.getUser();if(verified.error)throw verified.error;state.recovery=state.recovery||sessionStorage.getItem('orbita-recovery')==='yes';await activate(verified.data.user);}
      else showAuth('login');
      const params=new URLSearchParams(location.search);if(params.has('error')||new URLSearchParams(location.hash.slice(1)).has('error'))message('O link expirou ou já foi usado. Solicite um novo link de recuperação.');
    }catch{showAuth('login');message('Não foi possível restaurar seu acesso. Entre novamente ou continue sem conta.');}
    window.addEventListener('online',sync);
    window.addEventListener('offline',()=>setStatus('Sem conexão · salvo aqui'));
    window.addEventListener('beforeunload',event=>{if(state.user&&state.dirty){event.preventDefault();event.returnValue='';}});
  }
  window.orbitaAuth={decorate,sync,showAuth,logout};
  boot().catch(()=>{showAuth('login');message('Não foi possível iniciar sua conta. Atualize a página para tentar novamente.');});
})();
