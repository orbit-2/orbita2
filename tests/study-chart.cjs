const fs=require('fs'),path=require('path'),http=require('http'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const context={window:{},localStorage:{getItem(){return null},setItem(){}},document:{addEventListener(){}},console};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'study-chart.js'),'utf8'),context);
const model=context.window.StudyChart.model;
function at(value){return new Date(value+'T12:00:00');}
const fixtures=[{date:'2024-02-28',minutes:60},{date:'2024-02-28',minutes:30},{date:'2024-02-29',minutes:120},{date:'2024-03-01',minutes:999},{date:'2024-02-30',minutes:900},{date:'bad-date',minutes:20},{date:'2024-02-29',minutes:NaN},{date:'2024-02-29',minutes:-10}];
let m=model(fixtures,{scale:'week',now:at('2024-02-29')});assert.equal(m.days.length,7);assert.equal(m.observed,4);assert.equal(m.total,210);assert.equal(m.days.find(d=>d.key==='2024-02-28').minutes,90);assert.equal(m.days.find(d=>d.key==='2024-03-01').minutes,0);assert.equal(m.active,2);assert.equal(m.best,120);assert.equal(m.average,52.5);
m=model(fixtures,{scale:'month',now:at('2024-02-29')});assert.equal(m.days.length,29);assert.equal(m.total,210);
m=model(fixtures,{scale:'year',now:at('2024-02-29')});assert.equal(m.days.length,366);assert.equal(m.days.filter(d=>d.key==='2024-02-29').length,1);assert.equal(m.total,210);assert.equal(m.observed,60);
m=model([],{scale:'year',now:at('2026-10-17')});assert.equal(m.days.length,365);assert.equal(m.total,0);assert(Number.isFinite(m.maximum));assert(m.days.every(d=>Number.isFinite(d.x)&&Number.isFinite(d.y)));
m=model([],{scale:'month',now:at('2026-04-30')});assert.equal(m.days.length,30);assert.equal(m.observed,30);
m=model([],{scale:'week',now:at('2026-01-01')});assert.equal(m.days[0].key,'2025-12-29');assert.equal(m.days[6].key,'2026-01-04');assert.equal(m.observed,4);
m=model([],{scale:'month',offset:-1,now:at('2026-03-05')});assert.equal(m.days.length,28);assert.equal(m.observed,28);
m=model([{date:'2026-03-01',minutes:60},{date:'2026-02-01',minutes:30}],{scale:'month',now:at('2026-03-05')});assert.equal(m.percentage,100);assert.equal(m.average,12);
m=model([{date:'2026-10-17',minutes:100000}],{scale:'week',now:at('2026-10-17')});assert(m.maximum>=100000);assert(m.days.every(d=>d.y>=14&&d.y<=224));
console.log('PASS: daily aggregation, future/invalid data, zero state, leap years, year/month boundaries, comparison and large values.');

async function browserTests(){
 const {chromium}=require(process.env.ORBITA_PLAYWRIGHT_MODULE||'playwright');
 const allowed=new Set(['index.html','app.js','styles.css','auth.js','auth.css','study-chart.js','study-chart.css','courses.js','courses.css','tasks.js','tasks.css','vendor/supabase-2.118.0.js']);
 const server=http.createServer((req,res)=>{const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(file==='config.js'){res.setHeader('Content-Type','text/javascript');return res.end('window.ORBITA_CONFIG={enabled:false}');}if(!allowed.has(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(root,file)));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);
  assert.equal(await page.locator('[data-study-total]').innerText(),'0h 00min');assert(await page.locator('.study-empty').isVisible());
  await page.evaluate(()=>{db.name='Bruno';db.subjects=[{id:'math',name:'Matemática',color:'#aa95ff'},{id:'physics',name:'Física',color:'#70e4d1'}];const now=new Date();db.sessions=Array.from({length:300},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);return {id:'session-'+i,date:localDate(d),minutes:i%9===0?0:45+((i*37+130)%210),subject:i%2?'math':'physics',kind:'Exercícios'};}).filter(s=>s.minutes>0);save();});
  for(const width of [320,375,430,750,768,1024,1440]){
   await page.setViewportSize({width,height:1000});
   for(const [scale,name] of [['week','Semana'],['month','Mês'],['year','Ano']]){
    await page.getByRole('button',{name,exact:true}).click();
    assert.equal(await page.locator('#study-chart').getAttribute('data-scale'),scale);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow '+width+'/'+scale);
    const count=Number(await page.getByRole('slider').getAttribute('aria-valuemax'))+1;
    assert(count===(scale==='week'?7:scale==='month'?new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate():new Date().getFullYear()%4===0?366:365));
    const slider=page.getByRole('slider');await slider.focus();await slider.press('Home');assert.equal(await slider.getAttribute('aria-valuenow'),'0');await slider.press('ArrowRight');assert.equal(await slider.getAttribute('aria-valuenow'),'1');await slider.press('End');assert.equal(await slider.getAttribute('aria-valuenow'),String(count-1));
    const box=await slider.boundingBox();await slider.click({position:{x:box.width*.4,y:box.height*.5}});assert(Number(await slider.getAttribute('aria-valuenow'))>0);
    if(width<=750)assert(await page.evaluate(()=>document.querySelectorAll('#mobilebar button').length===7&&document.querySelector('#mobilebar').scrollWidth<=innerWidth+1));
   }
  }
  console.log('PASS: all scales at seven widths, all daily points, keyboard/pointer exploration, no overflow and mobile navigation intact.');
  await page.setViewportSize({width:375,height:900});
  for(const tab of ['timer','tasks','subjects','notes','config']){await page.evaluate(t=>{db.fontSize=14;go(t)},tab);assert(await page.locator('#sections input:not([type=hidden]):not([type=checkbox]):not([type=radio]),#sections select,#sections textarea').evaluateAll(inputs=>inputs.every(input=>parseFloat(getComputedStyle(input).fontSize)>=16)),'iPhone field size in '+tab);}
  await page.evaluate(()=>{db.fontSize=15;go('home')});
  assert(!await page.locator('meta[name=viewport]').getAttribute('content').then(value=>/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(value)),'Manual zoom must remain enabled');
  console.log('PASS: planner inputs stay at least 16px on mobile, including with 14px reading preference; manual zoom remains enabled.');
  await page.setViewportSize({width:1280,height:1000});
  await page.getByRole('button',{name:'Mês',exact:true}).click();await page.getByRole('button',{name:'Mês anterior',exact:true}).click();assert(await page.getByRole('button',{name:'Este mês',exact:true}).isEnabled());await page.getByRole('button',{name:'Este mês',exact:true}).click();assert(!await page.getByRole('button',{name:'Próximo período',exact:true}).isEnabled());
  await page.locator('[data-study-goal]').uncheck();assert.equal(await page.locator('.study-goal-line').count(),0);await page.reload();assert.equal(await page.locator('#study-chart').getAttribute('data-scale'),'month');assert(!await page.locator('[data-study-goal]').isChecked());await page.locator('[data-study-goal]').check();
  // A saved study session must update the chart, without any chart-specific data writes.
  await page.evaluate(()=>{db.sessions=[];save();go('timer')});await page.locator('form [name=minutes]').fill('60');await page.getByRole('button',{name:'Registrar tempo',exact:true}).click();await page.evaluate(()=>go('home'));assert.equal(await page.locator('[data-study-total]').innerText(),'1h 00min');
  console.log('PASS: period navigation, persisted scale/reference preference, and automatic updates from session recording.');
  // Max reading size and spacious cards must not break either atmosphere.
  for(const theme of ['cosmos','sunset','paper','matcha'])for(const width of [320,1440]){await page.setViewportSize({width,height:1000});await page.evaluate(t=>{db.fontSize=18;db.density=1.2;setTheme(t)},theme);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Theme/reading overflow '+theme+'/'+width);}
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.study-line').evaluate(el=>getComputedStyle(el).animationName),'none');
  console.log('PASS: dark/light themes, 18px reading size, spacious cards and reduced motion.');
  await page.evaluate(()=>{db.fontSize=15;db.density=1;db.name='Bruno';const now=new Date();db.sessions=Array.from({length:300},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);return {id:'demo-'+i,date:localDate(d),minutes:i%8===0?0:70+((i*43+85)%190),subject:'',kind:'Exercícios'};}).filter(s=>s.minutes>0);setTheme('cosmos')});
  await page.getByRole('button',{name:'Semana',exact:true}).click();await page.setViewportSize({width:1440,height:1100});await page.locator('#study-chart').screenshot({path:path.join(root,'study-chart-desktop.png'),animations:'disabled'});
  await page.setViewportSize({width:375,height:1100});await page.getByRole('button',{name:'Mês',exact:true}).click();await page.locator('#study-chart').screenshot({path:path.join(root,'study-chart-mobile.png'),animations:'disabled'});
  await page.setViewportSize({width:1440,height:1100});await page.getByRole('button',{name:'Ano',exact:true}).click();await page.locator('#study-chart').screenshot({path:path.join(root,'study-chart-year.png'),animations:'disabled'});
  assert.deepEqual(errors,[]);console.log('PASS: no JavaScript errors. Screenshots saved using local test data only.');
 }finally{await browser.close();server.close();}
}
browserTests().catch(e=>{console.error(e);process.exit(1)});
