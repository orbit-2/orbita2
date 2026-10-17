/* Runs only with two explicit disposable fixture UUIDs; no credentials are stored. */
const {chromium}=require(process.env.ORBITA_PLAYWRIGHT_MODULE||'playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ids=process.argv.slice(2);if(ids.length!==2||ids.some(x=>!(/^[\da-f-]{36}$/i.test(x))))throw Error('Pass exactly two disposable fixture UUIDs.');
const root=path.resolve(__dirname,'..'),allowed=new Set(['index.html','app.js','styles.css','auth.js','auth.css','study-chart.js','study-chart.css','courses.js','courses.css','config.js','vendor/supabase-2.118.0.js']);
async function signin(page,id){await page.locator('#auth-form [name=email]').fill('orbita-qa-'+id+'@example.invalid');await page.locator('#auth-form [name=password]').fill('OrbitaQa!'+id.replaceAll('-',''));await page.getByRole('button',{name:'Entrar na minha conta',exact:true}).click();await page.waitForFunction(()=>!document.body.classList.contains('auth-locked'));await page.waitForFunction(()=>document.querySelector('[data-sync-status]')?.textContent==='Sincronizado');}
(async()=>{
 const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';if(!allowed.has(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(root,name)));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext(),second=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await signin(page,ids[0]);
  await page.evaluate(()=>go('subjects'));await page.locator('[name=name]').fill('Validação real Órbita');await page.getByRole('button',{name:'+ Adicionar matéria',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-sync-status]')?.textContent==='Sincronizado');
  const other=await second.newPage();other.setDefaultTimeout(25000);await other.goto(origin);await signin(other,ids[0]);assert.equal(await other.evaluate(()=>db.subjects[0].name),'Validação real Órbita');
  console.log('PASS LIVE: password login, database save, and the same account on a second device.');
  await page.evaluate(()=>go('config'));await page.locator('[data-account-action=logout]').click();await page.locator('#auth-form').waitFor();await signin(page,ids[1]);assert.equal(await page.evaluate(()=>db.subjects.length),0);
  const isolation=await page.evaluate(async otherId=>{
    const auth=JSON.parse(localStorage.getItem('orbita-auth-v1'));const headers={apikey:ORBITA_CONFIG.supabasePublishableKey,Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json',Prefer:'return=representation'};
    const url=ORBITA_CONFIG.supabaseUrl+'/rest/v1/planner_documents?user_id=eq.'+otherId;
    const read=await fetch(url,{headers});const data=await read.json();
    const write=await fetch(url,{method:'PATCH',headers,body:JSON.stringify({payload:{subjects:[],tasks:[],sessions:[],courses:[],notes:[]}})});const written=await write.json();
    return {readStatus:read.status,rows:data.length,writeStatus:write.status,written:written.length};
  },ids[0]);assert.deepEqual(isolation,{readStatus:200,rows:0,writeStatus:200,written:0});
  console.log('PASS LIVE: another account sees no private data and cannot update it through direct REST requests.');
  assert.deepEqual(errors,[]);
  const settings=await page.evaluate(async()=>{const r=await fetch(ORBITA_CONFIG.supabaseUrl+'/auth/v1/settings',{headers:{apikey:ORBITA_CONFIG.supabasePublishableKey}});const v=await r.json();return {status:r.status,emailEnabled:v.external?.email,autoConfirm:v.mailer_autoconfirm};});console.log('Auth settings:',JSON.stringify(settings));
  for(const p of [page,other]){await p.evaluate(()=>go('config'));await p.locator('[data-account-action=logout]').click();await p.locator('#auth-form').waitFor();}
  await context.close();await second.close();console.log('PASS LIVE: sessions signed out; disposable accounts can now be removed.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
