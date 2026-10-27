// Extract cached public official documentation offline; scripts never execute.
import {readFileSync,writeFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
for(const name of ['email-templates','invite']){
 const dom=new JSDOM(readFileSync(`.sandbox/staff-research/${name}.html`,'utf8'));
 dom.window.document.querySelectorAll('script,style,nav,header,footer').forEach(n=>n.remove());
 const text=(dom.window.document.querySelector('main')??dom.window.document.body).textContent;
 writeFileSync(`verification/staff-official-${name}.txt`,text);
 for(const term of ['TokenHash','prefetch','PKCE','email scanners','RedirectTo']){const i=text.indexOf(term);if(i>=0)console.log(name,term,text.slice(Math.max(0,i-300),i+1800));}
 dom.window.close();
}
