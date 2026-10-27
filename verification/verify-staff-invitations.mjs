#!/usr/bin/env node
// Execute ONLY via tooling/sandbox.py. Sequential offline real checks, no hosted services.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {stripVTControlCharacters} from 'node:util';
if(process.env.GOLF_SANDBOX!=='1' || process.env.GOLF_SANDBOX_NETWORK!=='disabled')throw new Error('Required offline sandbox missing');
const env={...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'offline-fake-key',SUPABASE_SERVICE_ROLE_KEY:'staff-invitation-build-only-canary',STAFF_INVITE_SITE_URL:'http://127.0.0.1:3427'};
mkdirSync('.sandbox/staff-verification',{recursive:true});
writeFileSync('.sandbox/staff-verification/legacy-http.mjs',readFileSync('verification/frontend-http-smoke.mjs','utf8').replace("'verification/frontend-http-server.log'","'verification/staff-legacy-http-server.log'"));
const checks=[
 ['database','npm',['run','test:db']],
 ['staff-database','node',['supabase/tests/staff-invitations.test.mjs']],
 ['ui','npm',['run','test:ui','--','--maxWorkers=1']],
 ['lint','npm',['run','lint']],
 ['typecheck','npm',['run','typecheck']],
 ['build','npm',['run','build']],
 ['legacy-http','node',['--test','.sandbox/staff-verification/legacy-http.mjs']],
 ['staff-http','node',['--test','verification/staff-http-smoke.mjs']],
 ['session-http','node',['--test','verification/staff-session-refresh.test.mjs']],
 ['baseline-http','npm',['run','test:smoke']],
];
const report={started_at:new Date().toISOString(),network:'offline sandbox',services:'No real Supabase Auth/SMTP/Storage service; fake loopback configuration and explicitly fake Auth HTTP transport for session-http only',checks:[]};
const save=()=>writeFileSync('verification/staff-final-results.json',JSON.stringify(report,null,2)+'\n');
for(const [name,command,args] of checks){
 const start=Date.now();const r=spawnSync(command,args,{env,encoding:'utf8',maxBuffer:32*1024*1024});
 const output=(r.stdout??'')+(r.stderr??'')+(r.error?`\n${r.error.message}\n`:'');
 const log=`verification/staff-final-${name}.log`;writeFileSync(log,output);
 const plain=stripVTControlCharacters(output);
 const check={name,command:[command,...args].join(' '),exit_code:r.status,seconds:(Date.now()-start)/1000,log};
 if(name==='database'){
  check.suite_counts=[Number(plain.match(/(\d+) passed, 0 failed/)?.[1]??0),Number(plain.match(/Upgrade suite: (\d+) passed/)?.[1]??0),Number(plain.match(/Compatibility suite: (\d+) passed/)?.[1]??0)];
  check.tests_passed=check.suite_counts.reduce((a,b)=>a+b,0);
  if(check.tests_passed<418)check.count_error='Existing 418 DB checks not all witnessed';
 }
 if(name==='staff-database')check.tests_passed=Number(plain.match(/(\d+) staff invitation checks passed/)?.[1]??0);
 if(name==='ui'){check.tests_passed=Number(plain.match(/\n\s*Tests\s+(\d+) passed/)?.[1]??0);check.files_passed=Number(plain.match(/Test Files\s+(\d+) passed/)?.[1]??0);if(check.tests_passed<78)check.count_error='Existing UI baseline missing';}
 if(name.endsWith('http')){check.tests_passed=Number(plain.match(/(?:# |ℹ )?pass (\d+)/)?.[1]??0);check.tests_failed=Number(plain.match(/(?:# |ℹ )?fail (\d+)/)?.[1]??-1);check.tests_skipped=Number(plain.match(/(?:# |ℹ )?skipped (\d+)/)?.[1]??-1);}
 if('tests_passed' in check && check.tests_passed===0)check.count_error='No passing test count witnessed';
 if(name.endsWith('http') && (check.tests_failed!==0 || check.tests_skipped!==0))check.count_error='HTTP failures, skips or missing test summary';
 if(name==='legacy-http' && check.tests_passed!==16)check.count_error='Existing 16-check HTTP coverage missing';
 if(name==='staff-http' && check.tests_passed!==9)check.count_error='Expected 9 invitation HTTP checks';
 if(name==='session-http' && check.tests_passed!==4)check.count_error='Expected 4 session refresh HTTP checks';
 if(name==='baseline-http' && check.tests_passed!==6)check.count_error='Expected 6 baseline HTTP checks';
 report.checks.push(check);save();console.log(JSON.stringify(check));
 if(r.status!==0 || check.count_error){console.log(output);report.status='failed';report.finished_at=new Date().toISOString();save();process.exit(1);}
}
const staticFiles=[];
function walk(path){for(const e of readdirSync(path,{withFileTypes:true})){const p=`${path}/${e.name}`;if(e.isDirectory())walk(p);else staticFiles.push(p)}}walk('.next/static');
const banned=[env.SUPABASE_SERVICE_ROLE_KEY,'SUPABASE_SERVICE_ROLE_KEY','createInvitationAdmin'];
const leaks=staticFiles.filter(p=>{const body=readFileSync(p,'utf8');return banned.some(s=>body.includes(s))});
const scan={name:'browser-secret-scan',command:'Runner scans every .next/static file for fake build-secret canary, privileged variable name and factory',exit_code:leaks.length?1:0,files_scanned:staticFiles.length,leaking_paths:leaks};
report.checks.push(scan);
report.status=leaks.length?'failed':'passed';report.finished_at=new Date().toISOString();save();console.log(JSON.stringify(scan));
if(leaks.length)process.exitCode=1;
