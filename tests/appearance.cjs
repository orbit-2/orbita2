const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const {chromium}=require(process.env.ORBITA_PLAYWRIGHT_MODULE||'playwright');
const allowed=new Set(['index.html','app.js','styles.css','auth.js','auth.css','study-chart.js','study-chart.css','courses.js','courses.css','tasks.js','tasks.css','agenda.js','agenda.css','vendor/supabase-2.118.0.js']);
const server=http.createServer((req,res)=>{
 const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 if(file==='config.js'){res.setHeader('Content-Type','text/javascript');return res.end('window.ORBITA_CONFIG={enabled:false}');}
 if(!allowed.has(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(root,file)));
});
const luminance=hex=>{const c=hex.slice(1).match(/../g).map(v=>{const n=parseInt(v,16)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.emulateMedia({reducedMotion:'reduce'});await p.goto('http://127.0.0.1:'+server.address().port);await p.evaluate(()=>go('config'));
  assert.equal(await p.locator('.theme-tile').count(),20);assert.equal(await p.locator('.background-tile').count(),8);assert.equal(await p.locator('.look-tile').count(),4);
  const palettes=await p.evaluate(()=>Object.entries(themes).map(([k,t])=>({k,t,ink:readableInk(t[6])})));
  for(const {k,t,ink} of palettes){assert(contrast(t[3],t[1])>=7,k+' text');assert(contrast(t[4],t[1])>=4.5,k+' muted');assert(contrast(ink,t[6])>=4.5,k+' button');}
  await p.getByRole('button',{name:'Claros',exact:true}).click();assert.equal(await p.locator('.theme-tile').count(),9);await p.getByRole('button',{name:'Escuros',exact:true}).click();assert.equal(await p.locator('.theme-tile').count(),11);await p.getByRole('button',{name:'Todos',exact:true}).click();
  for(const {k,t} of palettes){await p.getByRole('button',{name:'Tema '+await p.evaluate(k=>themeNames[k],k),exact:true}).click();assert.equal(await p.evaluate(()=>db.theme),k);assert.equal(await p.locator('meta[name=theme-color]').getAttribute('content'),t[0]);assert.equal(await p.locator('.theme-tile[aria-pressed=true]').count(),1);}
  console.log('PASS: 20 named themes, light/dark filters, text/secondary/button contrast and theme selection.');
  for(const k of await p.evaluate(()=>Object.keys(backgrounds))){await p.getByRole('button',{name:'Fundo '+await p.evaluate(k=>backgrounds[k],k),exact:true}).click();assert.equal(await p.locator('body').getAttribute('data-background'),k);assert(await p.evaluate(()=>document.body.dataset.background==='plain'?getComputedStyle(document.body,'::before').display==='none':getComputedStyle(document.body,'::before').backgroundImage!=='none'));assert(await p.locator('.background-tile[aria-pressed=true]').count()===1);}
  await p.getByRole('button',{name:'Aplicar visual Biblioteca',exact:true}).click();assert.deepEqual(await p.evaluate(()=>[db.theme,db.background,db.fontFamily,db.radius]),['sand','dots','serif',12]);
  await p.getByLabel('Cor de destaque',{exact:true}).fill('#000000');await p.getByLabel('Cor complementar',{exact:true}).fill('#ffffff');
  await p.getByLabel('Estilo dos cartões',{exact:true}).selectOption('solid');await p.getByLabel('Estilo da fonte',{exact:true}).selectOption('mono');
  await p.getByRole('slider',{name:'Intensidade do fundo',exact:true}).fill('85');await p.getByRole('slider',{name:'Intensidade do fundo',exact:true}).dispatchEvent('change');
  const roundtrip=await p.evaluate(()=>{db.tasks.push({id:'keep-me',title:'Meu plano',subject:'',references:[],priority:'Normal',due:'',done:false});save();return normalizeData(JSON.parse(JSON.stringify(db)),true)});
  await p.reload();await p.evaluate(()=>go('config'));assert.deepEqual(await p.evaluate(()=>[db.theme,db.accent,db.accent2,db.fontFamily,db.backgroundStrength,db.cardStyle]),['sand','#000000','#ffffff','mono',85,'solid']);assert.equal(roundtrip.accent2,'#ffffff');assert.equal(roundtrip.backgroundStrength,85);assert.equal(roundtrip.fontFamily,'mono');
  for(const theme of ['paper','cosmos'])for(const accent of ['#000000','#ffffff','#777777','#ff0000']){const colors=await p.evaluate(({theme,accent})=>{db.theme=theme;db.accent=accent;db.accent2=accent;applyTheme();const s=getComputedStyle(document.documentElement);return {ink:s.getPropertyValue('--button-ink').trim(),readable:s.getPropertyValue('--accent-readable').trim(),t:themes[theme]};},{theme,accent});assert(contrast(colors.ink,accent)>=4.5,accent+' button');for(const surface of colors.t.slice(0,3))assert(contrast(colors.readable,surface)>=4.5,accent+' text');}
  const invalid=await p.evaluate(()=>normalizeData({background:'url(https://invalid)',fontFamily:'injection',cardStyle:'nope',accent2:'red',backgroundStrength:500}));assert.equal(invalid.background,'glow');assert.equal(invalid.fontFamily,'modern');assert.equal(invalid.cardStyle,'soft');assert.equal(invalid.accent2,'');assert.equal(invalid.backgroundStrength,100);
  console.log('PASS: backgrounds, curated look, custom colors, safe contrast fallback, new settings reload/backup, validation and backward compatibility.');
  for(const width of [320,375,430,750,768,1024,1440])for(const family of ['modern','humanist','serif','mono']){
   await p.setViewportSize({width,height:1000});await p.evaluate(f=>{db.fontFamily=f;db.fontSize=18;db.density=1.2;db.radius=32;db.theme='glacier';db.accent='';db.accent2='';save();go('config')},family);
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Settings overflow '+width+'/'+family);
   if(width<=750){assert(await p.locator('input:not([type=checkbox]),select').evaluateAll(els=>els.every(e=>parseFloat(getComputedStyle(e).fontSize)>=16)));assert(await p.locator('#mobilebar button').evaluateAll(els=>els.length===8&&els.every(e=>{const r=e.getBoundingClientRect();return r.x>=-1&&r.right<=innerWidth+1&&r.height>=44})));}
   for(const tab of ['home','agenda','timer','tasks','courses','subjects','notes','config']){await p.evaluate(tab=>go(tab),tab);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Tab overflow '+tab+'/'+width+'/'+family);}
  }
  await p.evaluate(()=>{resetAppearance();go('config')});assert.equal(await p.evaluate(()=>db.tasks[0].id),'keep-me');assert.equal(await p.evaluate(()=>db.accent2),'');assert.equal(await p.evaluate(()=>db.fontFamily),'modern');
  await p.setViewportSize({width:1440,height:1050});await p.evaluate(()=>{applyLook('garden');document.querySelector('#toast').classList.add('hidden')});await p.screenshot({path:path.join(root,'appearance-desktop.png'),fullPage:true});
  await p.setViewportSize({width:375,height:950});await p.evaluate(()=>{applyLook('night');document.querySelector('#toast').classList.add('hidden')});await p.screenshot({path:path.join(root,'appearance-mobile.png'),fullPage:true});
  assert(!/maximum-scale|user-scalable=no/.test(await p.locator('meta[name=viewport]').getAttribute('content')));assert.deepEqual(errors,[]);console.log('PASS: four font families, seven widths, large text/spacing, all eight tabs accessible, reset preserves studies and manual zoom stays available.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
