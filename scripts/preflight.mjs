import fs from 'node:fs';
import { localDate } from './lib/menu-contract.mjs';
import { isWorkday } from './lib/workday.mjs';
import { Gmail,mailConfig } from './lib/gmail-delivery.mjs';
import { GitHubJournal } from './lib/delivery-journal.mjs';
import { scheduledRunAllowed } from './lib/schedule.mjs';
const date=localDate();let skip=!isWorkday(date),reason=skip?'non_workday':'ready';
try {
if(!skip&&process.env.GITHUB_EVENT_NAME==='schedule'&&!scheduledRunAllowed(process.env.LUNCH_SCHEDULE)) {skip=true;reason='inactive_season_schedule';}
if(!skip&&process.env.SEND_EMAIL==='true') {
  const gmail=new Gmail(mailConfig());new GitHubJournal();await gmail.connect();
  if(await gmail.findDelivered(date)){skip=true;reason='already_sent';}
}
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`skip=${skip}\n`);
console.log(JSON.stringify({date,status:reason,modelCalls:0}));
}catch(error){
  const status={date,status:'failed',stage:'preflight',modelCalls:0,mailSecretPresent:!!process.env.GMAIL_OAUTH_JSON,error:error.message,finishedAt:new Date().toISOString()};
  fs.mkdirSync('output/autonomous',{recursive:true});
  fs.writeFileSync('output/autonomous/status.json',JSON.stringify(status,null,2));
  console.error(JSON.stringify(status));process.exitCode=1;
}
