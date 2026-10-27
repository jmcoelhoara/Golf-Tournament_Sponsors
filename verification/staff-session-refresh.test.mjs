// Real production Next HTTP; deliberately fake Auth transport, NOT Supabase/browser acceptance.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdirSync,writeFileSync} from 'node:fs';
import {after,before,test} from 'node:test';
import {JSDOM} from 'jsdom';

const base='http://127.0.0.1:3437';
const cookieName='sb-127-auth-token';
const user={id:'10000000-0000-0000-0000-000000000001',aud:'authenticated',role:'authenticated',email:'staff@example.test',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const fakePassword='offline-test-password-only';
const calls=[];
let auth,server,replacement,serverLog='';
function session(seconds,refreshToken){
 const now=Math.floor(Date.now()/1000);
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 // Deliberately unsigned fixture: HS256 makes the real SDK verify through the fake /user.
 const accessToken=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,aud:'authenticated',role:'authenticated',iat:now-7200,exp:now+seconds})}.${Buffer.from('fake-signature').toString('base64url')}`;
 return {access_token:accessToken,refresh_token:refreshToken,token_type:'bearer',expires_in:seconds,expires_at:now+seconds,user};
}
function sessionCookie(value){return `${cookieName}=base64-${Buffer.from(JSON.stringify(value)).toString('base64url')}`;}
function persistedCookie(response){
 const cookies=response.headers.getSetCookie().map(value=>value.split(';')[0]);
 assert.ok(cookies.some(value=>value.startsWith(`${cookieName}=`)||value.startsWith(`${cookieName}.0=`)),'Replacement session cookie must reach the HTTP client');
 return cookies.join('; ');
}
function decodedSession(cookie){
 const chunks=cookie.split('; ').map(value=>{const index=value.indexOf('=');return [value.slice(0,index),value.slice(index+1)];}).filter(([name])=>name===cookieName||name.startsWith(`${cookieName}.`)).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
 const encoded=decodeURIComponent(chunks.map(([,value])=>value).join(''));
 assert.ok(encoded.startsWith('base64-'),'Expected SSR encoded session');
 return JSON.parse(Buffer.from(encoded.slice(7),'base64url').toString());
}
async function request(path,options={}){
 const response=await fetch(`${base}${path}`,{redirect:'manual',signal:AbortSignal.timeout(15000),...options});
 const html=await response.text(); // Consume streamed Server Component output before inspecting calls.
 return {response,html};
}
before(async()=>{
 assert.equal(process.env.GOLF_SANDBOX,'1');
 assert.equal(process.env.GOLF_SANDBOX_NETWORK,'disabled');
 mkdirSync('.sandbox/staff-session-refresh',{recursive:true});
 auth=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=raw?JSON.parse(raw):{};
  const refreshedBearer=Boolean(replacement&&req.headers.authorization===`Bearer ${replacement.access_token}`);
  const call={method:req.method,path:req.url,refreshed_bearer:refreshedBearer};calls.push(call);
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST'&&req.url==='/auth/v1/token?grant_type=refresh_token'){
   call.expected_refresh=body.refresh_token==='fake-stale-refresh';
   if(!call.expected_refresh){res.writeHead(400);res.end(JSON.stringify({error:'invalid_grant'}));return;}
   replacement=session(3600,'fake-replacement-refresh');res.end(JSON.stringify(replacement));return;
  }
  if((req.method==='GET'||req.method==='PUT')&&req.url==='/auth/v1/user'&&refreshedBearer){
   if(req.method==='PUT')call.expected_password=body.password===fakePassword;
   res.end(JSON.stringify(user));return;
  }
  res.writeHead(401);res.end(JSON.stringify({message:'Unexpected offline fixture request'}));
 });
 auth.listen(54321,'127.0.0.1');await once(auth,'listening');
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3437'],{env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'offline-fake-key'},stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{serverLog+=chunk;});
 for(let i=0;i<100;i++){
  if(server.exitCode!==null)throw new Error('Next exited before readiness');
  try{const {response}=await request('/');if(response.ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw new Error('Offline Next readiness timeout');
});
after(async()=>{
 if(server?.exitCode===null){
  const stopped=once(server,'exit');server.kill('SIGTERM');
  let timer;await Promise.race([stopped,new Promise(resolve=>{timer=setTimeout(resolve,3000);})]);clearTimeout(timer);
  if(server.exitCode===null){server.kill('SIGKILL');await stopped;}
 }
 if(auth?.listening){const stopped=once(auth,'close');auth.close();auth.closeAllConnections();await stopped;}
 writeFileSync('.sandbox/staff-session-refresh/server.log',serverLog);
});
test('login control persists replacement cookies for an expired session',async()=>{
 calls.length=0;
 const {response}=await request('/login',{headers:{cookie:sessionCookie(session(-3600,'fake-stale-refresh'))}});
 assert.equal(response.status,200);
 const saved=decodedSession(persistedCookie(response));
 assert.ok(saved.access_token===replacement.access_token,'Control must persist refreshed access token');
 assert.ok(saved.refresh_token===replacement.refresh_token,'Control must persist refreshed refresh token');
 assert.equal(calls.filter(call=>call.method==='POST'&&call.expected_refresh).length,1);
});
test('invite GET, HEAD and prefetch stay inert even with an expired session cookie',async()=>{
 calls.length=0;
 const path=`/auth/invite?token_hash=${'a'.repeat(64)}&type=invite`;
 for(const options of [{},{method:'HEAD'},{headers:{'next-router-prefetch':'1',purpose:'prefetch'}}]){
  const {response}=await request(path,{...options,headers:{...options.headers,cookie:sessionCookie(session(-3600,'fake-stale-refresh'))}});
  assert.equal(response.status,200);
  assert.equal(response.headers.getSetCookie().length,0);
 }
 assert.equal(calls.length,0,'Invite landing must not contact Auth, refresh or verify an invitation');
});
for(const [label,seconds] of [['expired',-3600],['nearly expired',30]])test(`${label} password session persists cookies and reuses them on password POST`,async()=>{
 calls.length=0;
 const {response,html}=await request('/auth/set-password',{headers:{cookie:sessionCookie(session(seconds,'fake-stale-refresh'))}});
 assert.equal(response.status,200);
 assert.match(html,/name="password"/);
 assert.equal(calls.filter(call=>call.method==='POST'&&call.expected_refresh).length,1,'Exactly one refresh must precede render');
 assert.ok(calls.some(call=>call.method==='GET'&&call.refreshed_bearer),'Render must use the replacement session');
 const cookie=persistedCookie(response);
 const saved=decodedSession(cookie);
 assert.ok(saved.access_token===replacement.access_token,'Response must persist replacement access token');
 assert.ok(saved.refresh_token===replacement.refresh_token,'Response must persist replacement refresh token');

 // Submit the actual rendered progressive-enhancement form, including React's bound action fields.
 // This is an HTTP client cookie jar, not a browser or direct import of the action.
 const dom=new JSDOM(html);
 const form=dom.window.document.querySelector('input[name="password"]').closest('form');
 assert.equal(form.method,'post');
 const fields=new FormData();
 for(const input of form.querySelectorAll('input[type="hidden"][name]'))fields.append(input.name,input.value);
 assert.ok([...fields.keys()].some(name=>name.startsWith('$ACTION_')),'Use rendered server-action metadata');
 fields.set('password',fakePassword);fields.set('confirm_password',fakePassword);
 dom.window.close();
 calls.length=0;
 const posted=await request('/auth/set-password',{method:'POST',headers:{cookie,origin:base},body:fields});
 assert.equal(posted.response.status,303);
 assert.equal(new URL(posted.response.headers.get('location'),base).pathname,'/admin');
 assert.equal(calls.filter(call=>call.method==='POST').length,0,'Later submission must not reuse stale refresh cookies');
 const updates=calls.filter(call=>call.method==='PUT'&&call.path==='/auth/v1/user');
 assert.equal(updates.length,1,'Password action must reach the fake Auth update endpoint');
 assert.ok(updates[0].refreshed_bearer,'Password update must authenticate with the GET replacement token');
 assert.ok(updates[0].expected_password,'Password action must submit the chosen fixture password');
 assert.ok(calls.filter(call=>call.method==='GET').every(call=>call.refreshed_bearer),'Fresh user checks must use the replacement token');
});
