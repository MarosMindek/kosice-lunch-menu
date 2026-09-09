import fs from 'node:fs';
import {Gmail,mailConfig} from '../../scripts/lib/gmail-delivery.mjs';
const report={checkedAt:new Date().toISOString(),event:process.env.GITHUB_EVENT_NAME||'local',mailSecretPresent:!!process.env.GMAIL_OAUTH_JSON};
const failures=[];
async function github(route){
  const r=await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${route}`,{headers:{authorization:`Bearer ${process.env.GITHUB_TOKEN}`,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error(`GitHub readiness check failed (HTTP ${r.status})`);
  return r.json();
}
try {
  const repo=await github('');report.defaultBranch=repo.default_branch;
  const workflow=await github('/actions/workflows/daily-lunch.yml');
  report.workflowState=workflow.state;report.workflowId=workflow.id;
  if(repo.default_branch!=='main'||workflow.state!=='active')failures.push('SCHEDULE_NOT_ACTIVE');
  const runs=await github(`/actions/workflows/${workflow.id}/runs?event=schedule&per_page=5`);
  report.recentScheduledRuns=runs.workflow_runs.map(r=>({id:r.id,createdAt:r.created_at,status:r.status,conclusion:r.conclusion}));
}catch(e){failures.push(e.message);}
try {const gmail=new Gmail(mailConfig());await gmail.connect();report.gmailAuthorized=true;}
catch(e){report.gmailAuthorized=false;failures.push(e.message);}
report.failures=failures;report.ready=failures.length===0;
fs.mkdirSync('output/activation',{recursive:true});
fs.writeFileSync('output/activation/status.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Lunch activation\n\n- Trigger: ${report.event}\n- Default branch: ${report.defaultBranch||'unknown'}\n- Workflow: ${report.workflowState||'unknown'}\n- Gmail connected: ${report.gmailAuthorized}\n\n${failures.map(f=>'- '+f).join('\n')}\n\nSetup: [Gmail connection guide](https://github.com/MarosMindek/kosice-lunch-menu/blob/main/docs/AUTONOMOUS.md#jednorazové-pripojenie-gmailu)\n`);
if(failures.length)process.exitCode=1;
