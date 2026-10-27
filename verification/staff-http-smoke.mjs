// Real production Next HTTP with fake loopback configuration, NO Auth/SMTP server.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {before,after,test} from 'node:test';
const base='http://127.0.0.1:3427';let server;let log='';
before(async()=>{
 assert.equal(process.env.GOLF_SANDBOX,'1');assert.equal(process.env.GOLF_SANDBOX_NETWORK,'disabled');
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3427'],{env:process.env,stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{log+=chunk});
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error('Next exited before readiness');try{const r=await fetch(base,{signal:AbortSignal.timeout(1000)});await r.text();if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100));}
 throw new Error('Local Next readiness timeout');
});
after(async()=>{if(server?.exitCode===null){const stopped=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await Promise.race([stopped,new Promise(r=>setTimeout(r,3000))]);if(server.exitCode===null){server.kill('SIGKILL');await stopped;}}writeFileSync('verification/staff-http-server.log',log)});
const token='a'.repeat(64);
for(const method of ['GET','HEAD'])test(`${method} invitation landing is private and does not set an Auth session`,async()=>{const r=await fetch(`${base}/auth/invite?token_hash=${token}&type=invite`,{method});assert.equal(r.status,200);assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.equal(r.headers.get('set-cookie'),null);const html=await r.text();if(method==='GET'){assert.match(html,/Accept invitation/);assert.match(html,/only when you click/);}else assert.equal(html,'')});
test('repeated landing GETs still offer manual confirmation without backend',async()=>{for(let i=0;i<2;i++){const r=await fetch(`${base}/auth/invite?token_hash=${token}&type=invite`);assert.equal(r.status,200);assert.match(await r.text(),/>Accept invitation</)}});
for(const query of ['',`?token_hash=${token}&type=recovery`,`?token_hash=${token}&type=invite&next=https://evil.example.test`,`?token_hash=${token}&token_hash=${token}&type=invite`])test(`invalid landing variant ${query?'with rejected parameters':'without token'} shows help`,async()=>{const r=await fetch(`${base}/auth/invite${query}`);assert.equal(r.status,200);const html=await r.text();assert.match(html,/Open the complete staff invitation/);assert.doesNotMatch(html,/>Accept invitation</)});
test('signed-out password page does not expose password form',async()=>{const r=await fetch(`${base}/auth/set-password`,{redirect:'manual'});const html=await r.text();assert.ok([200,307].includes(r.status));assert.doesNotMatch(html,/name="password"/);if(r.status===307)assert.equal(new URL(r.headers.get('location'),base).pathname,'/login');else assert.match(html,/NEXT_REDIRECT|http-equiv="refresh"/);assert.equal(r.headers.get('referrer-policy'),'no-referrer')});
test('signed-out course mutation entry point remains protected',async()=>{const r=await fetch(`${base}/admin/courses/10000000-0000-0000-0000-000000000001`,{redirect:'manual'});assert.equal(r.status,307);assert.equal(new URL(r.headers.get('location'),base).pathname,'/login')});
