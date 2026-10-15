import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const forbiddenPaths=/(^|\/)(\.dev\.vars|\.env|node_modules|dist|backups)(\/|$)/;
const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,/\b\d{5,12}@qq\.com\b/,/\bCo-authored-by:|\bSigned-off-by:/i];
let errors=0;
for(const file of files){if(forbiddenPaths.test(file)){errors++;console.error('Forbidden path:',file);continue;}const data=readFileSync(file,'utf8');if(patterns.some(p=>p.test(data))){errors++;console.error('Sensitive-pattern match:',file);}}
if(errors)process.exitCode=1;else console.log(`PASS privacy baseline scan (${files.length} files); manual secret review still required`);
