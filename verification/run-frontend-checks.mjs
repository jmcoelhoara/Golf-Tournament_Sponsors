// Invoke only through tooling/sandbox.py. All checks run serially, offline.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {stripVTControlCharacters} from 'node:util';

const env={...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'offline-fake-key'};
const checks=[
 ['ui','npm',['run','test:ui','--','--maxWorkers=1']],
 ['lint','npm',['run','lint']],
 ['typecheck','npm',['run','typecheck']],
 ['build','npm',['run','build']],
 ['http','node',['--test','verification/frontend-http-smoke.mjs']],
];
const report={started_at:new Date().toISOString(),network:'offline sandbox',backend:'none; fake loopback configuration only',checks:[]};
for(const [name,command,args] of checks){
 const start=Date.now();
 const result=spawnSync(command,args,{env,encoding:'utf8',maxBuffer:16*1024*1024});
 const output=(result.stdout??'')+(result.stderr??'')+(result.error?`\n${result.error.message}\n`:'');
 const log=`verification/frontend-final-${name}.log`;
 writeFileSync(log,output);
 const plain=stripVTControlCharacters(output);
 const check={name,command:[command,...args].join(' '),exit_code:result.status,seconds:(Date.now()-start)/1000,log};
 if(name==='ui'){
  check.files_passed=Number(plain.match(/Test Files\s+(\d+) passed/)?.[1]??0);
  check.tests_passed=Number(plain.match(/\n\s*Tests\s+(\d+) passed/)?.[1]??0);
 }
 if(name==='http')check.tests_passed=Number(plain.match(/pass (\d+)/)?.[1]??0);
 report.checks.push(check);
 writeFileSync('verification/frontend-final-results.json',JSON.stringify(report,null,2)+'\n');
 console.log(output);
 console.log(JSON.stringify(check));
}
const baseline=stripVTControlCharacters(readFileSync('verification/resume-baseline.log','utf8'));
report.baseline_ui_tests=Number(baseline.match(/\n\s*Tests\s+(\d+) passed/)?.[1]??0);
report.added_ui_tests=report.checks.find(c=>c.name==='ui').tests_passed-report.baseline_ui_tests;
report.finished_at=new Date().toISOString();
writeFileSync('verification/frontend-final-results.json',JSON.stringify(report,null,2)+'\n');
if(report.checks.some(c=>c.exit_code!==0) || !report.checks.find(c=>c.name==='ui').tests_passed || !report.checks.find(c=>c.name==='http').tests_passed)process.exitCode=1;
