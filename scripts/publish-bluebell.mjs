import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDate, validateSource } from './lib/menu-contract.mjs';

export function publishBluebell(from='output/bluebell-hires',to='results/bluebell-hires',date=localDate()) {
  if(!fs.existsSync(from))return;
  fs.mkdirSync(to,{recursive:true});
  // Diagnostic refreshes must not erase a usable weekly original.
  for(const entry of fs.readdirSync(from)) {
    if(entry==='validated.json')continue;
    fs.cpSync(path.join(from,entry),path.join(to,entry),{recursive:true});
  }
  const candidate=path.join(from,'validated.json');
  if(fs.existsSync(candidate)) {
    const menu=JSON.parse(fs.readFileSync(candidate,'utf8'));
    validateSource(menu.source,date,'bluebell');
    if(menu.reviewedComplete!==true || menu.needsVisualReview===true)throw Error('BlueBell candidate is not complete');
    fs.copyFileSync(candidate,path.join(to,'validated.json'));
    fs.rmSync(path.join(to,'validation-error.json'),{force:true});
  }
}
if(process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))publishBluebell();
