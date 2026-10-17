const {chromium}=require(process.env.ORBITA_PLAYWRIGHT_MODULE||'playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const allowed=new Set(['index.html','app.js','styles.css','auth.js','auth.css','study-chart.js','study-chart.css','courses.js','courses.css','config.js','vendor/supabase-2.118.0.js']);
const users={a:{id:'11111111-1111-4111-8111-111111111111',email:'a@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),user_metadata:{name:'Pessoa A'},app_metadata:{provider:'email',providers:['email']},identities:[],created_at:new Date().toISOString()},b:{id:'22222222-2222-4222-8222-222222222222',email:'b@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString(),user_metadata:{name:'Pessoa B'},app_metadata:{provider:'email',providers:['email']},identities:[],created_at:new Date().toISOString()}};
const jwt=user=>[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),iss:'https://test.supabase.co/auth/v1'})).toString('base64url'),'test-signature'].join('.');
const session=user=>({access_token:jwt(user),refresh_token:'refresh-'+user.id,expires_in:3600,token_type:'bearer',user});
const docs=new Map();let signupCount=0,recoveryCount=0,passwordUpdates=0,offline=false;
function mockUser(headers){try{const token=(headers.authorization||'').replace('Bearer ','');const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));return Object.values(users).find(u=>u.id===claims.sub);}catch{return null;}}
async function api(route){
 if(offline)return route.abort('failed');
 const req=route.request(),url=new URL(req.url()),body=req.postDataJSON(),user=mockUser(req.headers());
 const reply=(status,data)=>route.fulfill({status,contentType:'application/json',headers:{'x-supabase-api-version':'2024-01-01'},body:JSON.stringify(data)});
 if(url.pathname.endsWith('/auth/v1/token')){
  if(url.searchParams.get('grant_type')==='pkce')return reply(200,session(users.a));
  const found=Object.values(users).find(u=>u.email===body.email);
  if(!found||body.password!=='CorrectTest123!')return reply(400,{code:'invalid_credentials',msg:'Invalid login credentials'});
  return reply(200,session(found));
 }
 if(url.pathname.endsWith('/auth/v1/user')){if(!user)return reply(401,{msg:'Invalid JWT'});if(req.method()==='PUT')passwordUpdates++;return reply(200,user);}
 if(url.pathname.endsWith('/auth/v1/signup')){signupCount++;return reply(200,{...users.a,email:body.email,identities:[]});}
 if(url.pathname.endsWith('/auth/v1/recover')){recoveryCount++;return reply(200,{});}
 if(url.pathname.endsWith('/auth/v1/logout'))return route.fulfill({status:204,body:''});
 if(url.pathname.endsWith('/rest/v1/planner_documents')){
  if(!user)return reply(401,{message:'Not authenticated'});
  const owner=url.searchParams.get('user_id')?.replace('eq.','')||body?.user_id;
  if(owner!==user.id)return reply(403,{code:'42501',message:'RLS violation'});
  let row=docs.get(owner),result=[];
  if(req.method()==='GET')result=row?[row]:[];
  if(req.method()==='POST'){
   if(row)return reply(409,{code:'23505',message:'Duplicate key'});
   row={payload:body.payload,revision:1,updated_at:new Date().toISOString()};docs.set(owner,row);result=[row];
  }
  if(req.method()==='PATCH'&&row&&row.revision===Number(url.searchParams.get('revision')?.replace('eq.',''))){row={payload:body.payload,revision:row.revision+1,updated_at:new Date().toISOString()};docs.set(owner,row);result=[row];}
  return reply(200,req.headers().accept?.includes('vnd.pgrst.object')?(result[0]||null):result);
 }
 return reply(404,{message:'Unhandled endpoint '+url.pathname});
}
async function signin(page,who){await page.locator('#auth-form [name=email]').fill(users[who].email);await page.locator('#auth-form [name=password]').fill('CorrectTest123!');await page.getByRole('button',{name:'Entrar na minha conta',exact:true}).click();await page.waitForFunction(()=>!document.body.classList.contains('auth-locked'));await page.waitForFunction(()=>document.querySelector('[data-sync-status]')?.textContent==='Sincronizado');}
async function signout(page){await page.evaluate(()=>go('config'));await page.locator('[data-account-action=logout]').click();await page.waitForSelector('#auth-form');await page.waitForFunction(()=>document.body.classList.contains('auth-locked'));}
(async()=>{
 const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';if(!allowed.has(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(root,name)));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext();await context.route('https://*.supabase.co/**',api);const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')console.log('BROWSER ERROR:',m.text())});
  await page.goto(origin);await page.getByRole('heading',{name:'Bom ter você por aqui.'}).waitFor();
  for(const width of [320,375,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(width<=750)assert(await page.locator('#auth-form input').evaluateAll(inputs=>inputs.every(input=>parseFloat(getComputedStyle(input).fontSize)>=16)),'Login fields must prevent Safari focus zoom');}
  await page.setViewportSize({width:1280,height:900});
  await page.locator('#auth-form [name=email]').fill('a@example.invalid');await page.locator('#auth-form [name=password]').fill('wrong');await page.getByRole('button',{name:'Entrar na minha conta',exact:true}).click();await page.locator('#auth-message:not(.hidden)').waitFor();console.log('Credential validation:',await page.locator('#auth-message').innerText());assert.match(await page.locator('#auth-message').innerText(),/E-mail ou senha incorretos/);assert(await page.locator('.app').isHidden());
  await signin(page,'a');assert.equal(await page.evaluate(()=>db.name),'Pessoa A');
  await page.evaluate(()=>go('subjects'));await page.locator('[name=name]').fill('Matéria privada A');await page.getByRole('button',{name:'+ Adicionar matéria',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-sync-status]')?.textContent==='Sincronizado');assert.equal(docs.get(users.a.id).payload.subjects[0].name,'Matéria privada A');
  await page.reload();await page.waitForFunction(()=>!document.body.classList.contains('auth-locked'));assert.equal(await page.evaluate(()=>db.subjects[0].name),'Matéria privada A');
  console.log('PASS: responsive login, invalid credentials, real SDK session persistence and cloud save (mock transport).');
  const second=await browser.newContext();await second.route('https://*.supabase.co/**',api);const other=await second.newPage();await other.goto(origin);await other.locator('#auth-form').waitFor();await signin(other,'a');assert.equal(await other.evaluate(()=>db.subjects[0].name),'Matéria privada A');
  await signout(page);await signin(page,'b');assert.equal(await page.evaluate(()=>db.subjects.length),0);assert.equal(await page.evaluate(()=>db.name),'Pessoa B');assert(!await page.locator('body').innerText().then(s=>s.includes('Matéria privada A')));
  await signout(page);await signin(page,'a');assert.equal(await page.evaluate(()=>db.subjects[0].name),'Matéria privada A');console.log('PASS: separate accounts on the same browser and same account on two devices.');
  // A local edit and another device's edit must never overwrite each other silently.
  offline=true;await page.evaluate(()=>{db.notes.push({id:'local-note',title:'Local',body:'Keep me',date:today(),subject:''});save()});
  offline=false;const row=docs.get(users.a.id);row.payload={...row.payload,name:'Outro dispositivo'};row.revision++;
  await page.evaluate(()=>orbitaAuth.sync());await page.getByRole('heading',{name:'Você tem alterações em dois lugares.'}).waitFor();assert.equal(docs.get(users.a.id).payload.notes.length,0);
  page.once('dialog',d=>d.accept());await page.locator('[data-account-action=use-local]').click();await page.waitForFunction(()=>document.querySelector('[data-sync-status]')?.textContent==='Sincronizado');assert.equal(docs.get(users.a.id).payload.notes[0].title,'Local');
  console.log('PASS: offline edits survive and concurrent changes require an explicit conflict choice.');
  // Import guest history, preserving cloud records and original guest storage.
  await page.evaluate(()=>{db.courses.push({id:'shared-course',title:'Curso da nuvem',subject:'',url:'',lessons:[]});save();});await page.waitForFunction(()=>document.querySelector('[data-sync-status]')?.textContent==='Sincronizado');
  await page.evaluate(()=>{localStorage.setItem(KEY,JSON.stringify({...defaults,subjects:[{id:'legacy-subject',name:'Histórico antigo',color:'#aabbcc'}],courses:[{id:'shared-course',title:'Curso antigo',subject:'legacy-subject',url:'',lessons:[{id:'legacy-lesson',title:'Aula 1',done:true}]}],tasks:[{id:'legacy-task',title:'Tarefa antiga',subject:'legacy-subject',priority:'Normal',due:'',done:false,courseId:'shared-course',lessonId:'legacy-lesson'}],notes:[{id:'legacy-note',title:'Nota antiga',body:'Conteúdo',date:today(),subject:'legacy-subject',courseId:'shared-course',lessonId:'legacy-lesson'}]}))});
  await page.reload();await page.getByRole('heading',{name:'Seus estudos já estavam por aqui?'}).waitFor();await page.locator('[data-account-action=import-local]').click();await page.waitForFunction(()=>document.querySelector('[data-sync-status]')?.textContent==='Sincronizado');assert.equal(await page.evaluate(()=>db.subjects.length),2);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(KEY)).subjects[0].name),'Histórico antigo');
  console.log('PASS: legacy import preserves cloud data, subject links and original local history.');
  assert(await page.evaluate(()=>{const imported=db.courses.find(c=>c.title==='Curso antigo'),cloud=db.courses.find(c=>c.title==='Curso da nuvem');return imported&&cloud&&imported.id!==cloud.id&&db.tasks.find(t=>t.id==='legacy-task').courseId===imported.id&&db.notes.find(n=>n.id==='legacy-note').courseId===imported.id}));console.log('PASS: imported course ID collisions preserve task/note relationships.');
  await signout(page);await page.locator('[data-auth-mode=signup]').click();await page.locator('#auth-form [name=email]').fill('new@example.invalid');await page.locator('#auth-form [name=password]').fill('CorrectTest123!');await page.locator('#auth-form [name=confirm]').fill('Mismatch123!');await page.getByRole('button',{name:'Criar minha conta'}).click();try{await page.getByText('As senhas não coincidem.',{exact:false}).waitFor({timeout:4000});}catch(e){console.log('SIGNUP DIAGNOSTIC',await page.evaluate(()=>({title:document.querySelector('#auth-title')?.textContent,message:document.querySelector('#auth-message')?.textContent,fields:[...document.querySelectorAll('#auth-form input')].map(i=>({name:i.name,valid:i.validity.valid,error:i.validationMessage})),button:document.querySelector('#auth-form button[type=submit]')?.textContent})));throw e;}assert.equal(signupCount,0);await page.locator('#auth-form [name=confirm]').fill('CorrectTest123!');await page.getByRole('button',{name:'Criar minha conta'}).click();await page.getByText('Confira seu e-mail para confirmar a conta.',{exact:false}).waitFor();assert.equal(signupCount,1);
  await page.locator('[data-auth-mode=forgot]').click();await page.locator('#auth-form [name=email]').fill('a@example.invalid');await page.getByRole('button',{name:'Enviar link de recuperação'}).click();await page.getByText('Se existir uma conta com esse e-mail',{exact:false}).waitFor();assert.equal(recoveryCount,1);
  await page.goto(origin+'/?code=test-auth-code&auth=recovery');await page.getByRole('heading',{name:'Escolha sua nova senha.'}).waitFor();await page.locator('#auth-form [name=password]').fill('NewPassword123!');await page.locator('#auth-form [name=confirm]').fill('NewPassword123!');await page.getByRole('button',{name:'Salvar nova senha'}).click();await page.waitForFunction(()=>!document.body.classList.contains('auth-locked'));assert.equal(passwordUpdates,1);
  console.log('PASS: signup validation, confirmation state, forgot password and PKCE recovery update.');
  for(const width of [320,375,430,750,768,1280]){await page.setViewportSize({width,height:900});for(const tab of ['home','timer','tasks','courses','subjects','notes','config']){await page.evaluate(t=>go(t),tab);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow '+width+'/'+tab);if(width<=750)assert(await page.evaluate(()=>document.querySelector('#mobilebar').scrollWidth<=innerWidth+1));}}
  assert.deepEqual(errors,[]);console.log('PASS: all seven planner tabs in six viewport widths, no overflow, no JS errors.');
  await signout(page);await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(root,'auth-desktop.png'),animations:'disabled'});await page.setViewportSize({width:375,height:900});await page.screenshot({path:path.join(root,'auth-mobile.png'),animations:'disabled'});
  await other.close();await second.close();await context.close();
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exit(1)});
