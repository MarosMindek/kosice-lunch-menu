import fs from 'node:fs';
import path from 'node:path';
import { localDate,sha256 } from './lib/menu-contract.mjs';
import { isWorkday } from './lib/workday.mjs';
import { collectMenu } from './lib/collect-menu.mjs';
import { renderEmail,validateBody } from './render-email.mjs';
import { mailConfig,Gmail,deliver } from './lib/gmail-delivery.mjs';
import { GitHubJournal } from './lib/delivery-journal.mjs';

const args=new Set(process.argv.slice(2)),out='output/autonomous',date=localDate();
if([...args].some(a=>!['--send','--dry-run','--check-config'].includes(a)))throw Error('Usage: node scripts/lunch.mjs --dry-run|--send|--check-config');
if(args.has('--send')&&args.has('--dry-run'))throw Error('Choose one execution mode');
fs.mkdirSync(out,{recursive:true});
for(const name of ['email.json','email.html','email.txt','normalized-menu.json','status.json','sources.json'])fs.rmSync(path.join(out,name),{force:true});
const status={date,mode:args.has('--send')?'send':'dry-run',startedAt:new Date().toISOString(),modelCalls:0,mailSecretPresent:!!process.env.GMAIL_OAUTH_JSON};
try {
  if(args.has('--check-config')){mailConfig();new GitHubJournal();status.status='configured';}
  else if(!isWorkday(date))status.status='non_workday';
  else {
    const template=fs.readFileSync('templates/email-v1.html'),expected=fs.readFileSync('templates/email-v1.sha256','utf8').trim();
    if(sha256(template)!==expected)throw Error('Fixed email template checksum mismatch');
    let gmail,journal;
    if(args.has('--send')) {gmail=new Gmail(mailConfig());journal=new GitHubJournal();await gmail.connect();}
    if(gmail&&await gmail.findDelivered(date))status.status='already_sent';
    else {
      const menu=await collectMenu(date,{out,onStatus:s=>console.log(JSON.stringify(s))}),message=renderEmail(menu);
      validateBody(message,menu);
      fs.writeFileSync(path.join(out,'normalized-menu.json'),JSON.stringify(menu,null,2));
      fs.writeFileSync(path.join(out,'email.json'),JSON.stringify(message,null,2));
      fs.writeFileSync(path.join(out,'email.html'),message.html);fs.writeFileSync(path.join(out,'email.txt'),message.plain);
      status.counts=menu.restaurants.map(r=>({id:r.id,soups:r.soups.length,mains:r.mains.length,desserts:r.desserts?.length||0}));
      status.templateVersion=message.templateVersion;status.menuDigest=message.menuDigest;
      status.status=gmail?(await deliver({menu,message,gmail,journal})).status:'dry_run_validated';
    }
  }
}catch(error){status.status='failed';status.error=error.message;process.exitCode=1;}
finally{status.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'status.json'),JSON.stringify(status,null,2));console.log(JSON.stringify(status));}
