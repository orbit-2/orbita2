/* Public playlist metadata only. No cookies, user credentials or arbitrary URLs. */
const cache=new Map(),VIDEO=/^[\w-]{11}$/,LIST=/^[\w-]{10,100}$/;
const label=v=>(v?.simpleText||v?.runs?.map(r=>r.text).join('')||'').slice(0,160);
function initialData(html){
 const match=/(?:var\s+ytInitialData|window\[["']ytInitialData["']\]|ytInitialData)\s*=\s*(?=[{"'])/.exec(html);
 if(!match)throw Error('metadata');
 const begin=match.index+match[0].length;
 if(html[begin]==="'"||html[begin]==='"'){
  const quote=html[begin];let end=begin+1,escaped=false;
  for(;end<html.length;end++){if(escaped)escaped=false;else if(html[end]==='\\')escaped=true;else if(html[end]===quote)break;}
  const body=html.slice(begin+1,end).replace(/\\(x[\da-f]{2}|u[\da-f]{4}|[\s\S])/gi,(_,s)=>s[0]==='x'||s[0]==='u'?String.fromCharCode(parseInt(s.slice(1),16)):({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'}[s]??s));
  return JSON.parse(body);
 }
 const start=begin;let depth=0,string=false,escape=false;
 for(let i=start;i<html.length;i++){const c=html[i];if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;}else if(c==='"')string=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return JSON.parse(html.slice(start,i+1));}
 throw Error('metadata');
}
function find(object,name){
 if(!object||typeof object!=='object')return null;if(object[name])return object[name];
 for(const value of Object.values(object)){if(value&&typeof value==='object'){const result=find(value,name);if(result)return result;}}return null;
}
function parsePublic(html){
 const data=initialData(html),list=find(data.contents,'playlistVideoListRenderer');
 let videos,partial;
 if(list){videos=(list.contents||[]).flatMap(item=>{const v=item.playlistVideoRenderer;return v&&VIDEO.test(v.videoId)?[{videoId:v.videoId,title:label(v.title)||'Vídeo indisponível'}]:[];});partial=(list.contents||[]).some(item=>item.continuationItemRenderer);}
 else{
  const tabs=(data.contents?.singleColumnBrowseResultsRenderer||data.contents?.twoColumnBrowseResultsRenderer)?.tabs,content=tabs?.find(t=>t.tabRenderer?.selected)?.tabRenderer?.content,section=find(content,'itemSectionRenderer');
  if(!section)throw Error('unavailable');
  videos=(section.contents||[]).flatMap(item=>{const v=item.lockupViewModel;return v?.contentType==='LOCKUP_CONTENT_TYPE_VIDEO'&&VIDEO.test(v.contentId)?[{videoId:v.contentId,title:String(v.metadata?.lockupMetadataViewModel?.title?.content||'Vídeo indisponível').slice(0,160)}]:[];});partial=!!(find(content,'continuationItemRenderer')||find(content,'continuationItemViewModel'));
 }
 const title=find(data,'playlistMetadataRenderer')?.title||find(data,'playlistHeaderRenderer')?.title?.simpleText||find(data,'pageHeaderRenderer')?.pageTitle||'Playlist do YouTube';
 const reported=Number(label(find(data,'playlistHeaderRenderer')?.numVideosText).replace(/\D/g,''))||0;
 return {title:String(title).slice(0,160),lessons:videos.slice(0,500),partial:(reported?reported>videos.length:partial)||videos.length>500};
}
async function request(url,json=true){
 const response=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'error',headers:{'Accept-Language':'pt-BR,pt;q=0.9','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'}});
 if(!response.ok)throw Error('upstream');
 const body=await response.text();if(body.length>5_000_000)throw Error('large');return json?JSON.parse(body):body;
}
async function official(list,key){
 const base='https://www.googleapis.com/youtube/v3/';
 const meta=await request(base+'playlists?'+new URLSearchParams({part:'snippet',id:list,key}));
 if(!meta.items?.length)throw Error('unavailable');
 const lessons=[];let next='',pages=0;const deadline=Date.now()+20000;
 do{
  if(Date.now()>deadline||pages++>=10)throw Error('timeout');
  const data=await request(base+'playlistItems?'+new URLSearchParams({part:'snippet',playlistId:list,maxResults:'50',pageToken:next,key}));
  for(const item of data.items||[]){const s=item.snippet;if(VIDEO.test(s?.resourceId?.videoId))lessons.push({title:String(s.title||'Vídeo indisponível').slice(0,160),videoId:s.resourceId.videoId});}
  next=data.nextPageToken||'';
 }while(next&&lessons.length<500);
 return {title:String(meta.items[0].snippet.title).slice(0,160),lessons:lessons.slice(0,500),partial:!!next||lessons.length>500};
}
async function handler(req,res){
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(code,data)=>res.status(code).json(data);
 if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'Método não permitido.'});}
 const list=new URL(req.url,'https://orbita.invalid').searchParams.get('list');
 if(!LIST.test(list||''))return send(400,{error:'Use um link de playlist válido do YouTube.'});
 try{
  let data=cache.get(list);if(!data||data.expires<Date.now()){
   const result=process.env.YOUTUBE_API_KEY?await official(list,process.env.YOUTUBE_API_KEY):parsePublic(await request('https://www.youtube.com/playlist?list='+encodeURIComponent(list)+'&hl=pt-BR',false));
   if(!result.lessons.length)throw Error('empty');
   data={...result,playlistId:list,expires:Date.now()+300000};if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(list,data);
  }
  res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=600');
  const {expires,...result}=data;return send(200,result);
 }catch{
  res.setHeader('Cache-Control','no-store');return send(502,{error:'Não foi possível ler esta playlist. Confira se ela é pública ou não listada e tente novamente. Você também pode criar o curso manualmente.'});
 }
}
module.exports=handler;
module.exports.parsePublic=parsePublic;
module.exports.official=official;
