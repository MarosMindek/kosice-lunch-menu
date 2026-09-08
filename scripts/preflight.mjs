import fs from 'node:fs';
import { localDate } from './lib/menu-contract.mjs';
import { isWorkday } from './lib/workday.mjs';
import { Gmail,mailConfig } from './lib/gmail-delivery.mjs';
import { GitHubJournal } from './lib/delivery-journal.mjs';
const date=localDate();let skip=!isWorkday(date),reason=skip?'non_workday':'ready';
if(!skip&&process.env.SEND_EMAIL==='true') {
  const gmail=new Gmail(mailConfig());new GitHubJournal();await gmail.connect();
  if(await gmail.findDelivered(date)){skip=true;reason='already_sent';}
}
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`skip=${skip}\n`);
console.log(JSON.stringify({date,status:reason,modelCalls:0}));
