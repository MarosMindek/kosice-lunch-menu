import test from 'node:test';
import assert from 'node:assert/strict';
import {runLunchBridge} from '../automation/bridge.mjs';
const recipient='recipient@example.com';
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bratislava',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
const date=`${parts.year}-${parts.month}-${parts.day}`,subject='Obedové menu – Košice | '+date.split('-').reverse().join('.');
const message={date,subject,html:'<html>fixed menu</html>',plain:'fixed menu',templateVersion:'kosice-lunch-email-v1'};
const ok=structuredContent=>({structuredContent});
function setup({existing=false,sendError=false,changedCopy=false,failedCollector=false}={}) {
  let posts=0,claim=false,branch='head',attempt=1,commitNumber=0;
  const parents=new Map(),states=new Map(),bodyCopies=[];
  const run=()=>({id:9,path:'.github/workflows/daily-lunch.yml',event:'push',status:'completed',conclusion:failedCollector?'failure':'success',run_attempt:attempt,head_sha:'build'});
  const tools={
    async exec_command({cmd}) {
      let output='';
      if(cmd.includes('tempfile.mkdtemp'))output='/tmp/fake-bridge';
      if(cmd.startsWith('node')&&cmd.includes('workday:isWorkday'))output=JSON.stringify({date,workday:true});
      if(cmd.startsWith('node')&&cmd.includes('validateBody(message,menu)'))output=JSON.stringify({message,key:'a'.repeat(64),counts:[{id:'bluebell',mains:5}]});
      return{exit_code:0,output};
    },
    async mcp__codex_apps__gmail_search_emails(){return ok({emails:existing?[{id:'prior',subject,labels:['SENT'],to:[recipient]}]:[]});},
    async mcp__codex_apps__github_fetch({url}) {
      let value;
      if(url.endsWith('/actions/runs?per_page=30'))value={workflow_runs:[run()]};
      else if(url.endsWith('/actions/runs/9'))value=run();
      else if(url.includes('/git/ref/heads/'))value={object:{sha:branch}};
      else if(url.includes('/git/commits/'))value={tree:{sha:'tree'}};
      else throw Error('Unexpected URL '+url);
      return ok({content:JSON.stringify(value)});
    },
    async mcp__codex_apps__github_fetch_file({path}){return path.startsWith('deliveries/')?(claim?ok({content:'{}'}):{isError:true,structuredContent:{error:'HTTP 404'}}):ok({content:'source'});},
    async mcp__codex_apps__github_fetch_workflow_run_jobs(){return ok({jobs:[{id:11,name:'lunch'}]});},
    async mcp__codex_apps__github_rerun_workflow_job(){attempt++;return ok({success:true});},
    async mcp__codex_apps__github_fetch_workflow_run_artifacts(){return ok({artifacts:[{id:22,name:`lunch-9-${attempt}`,created_at:new Date().toISOString()}]});},
    async mcp__codex_apps__github_download_workflow_artifact(){return ok({file_uri:{download_url:'https://example.invalid/artifact'}});},
    async mcp__codex_apps__github_create_tree({tree_elements}) {
      const state=JSON.parse(tree_elements[0].content);assert.ok(!JSON.stringify(state).includes(recipient));
      states.set('tree'+states.size,state);return ok({sha:'tree'+(states.size-1)});
    },
    async mcp__codex_apps__github_create_commit({parent_sha,tree_sha}){const sha='commit'+commitNumber++;parents.set(sha,{parent:parent_sha,state:states.get(tree_sha)});return ok({sha});},
    async mcp__codex_apps__github_update_ref({sha,force}){assert.equal(force,false);const c=parents.get(sha);if(c.parent!==branch)return{isError:true,structuredContent:{error:'Not fast forward'}};branch=sha;claim=true;return ok({success:true});},
    async mcp__codex_apps__gmail_send_email(args){assert.equal(claim,true);posts++;bodyCopies.push(args);if(sendError)throw Error('response lost');return ok({id:'sent'});},
    async mcp__codex_apps__gmail_read_email(){return ok({label_ids:['SENT'],payload:{headers:[{name:'To',value:recipient},{name:'Subject',value:subject}],parts:[{mime_type:'text/plain',body:{content:message.plain}},{mime_type:'text/html',body:{content:changedCopy?'changed':message.html}}]}});}
  };
  return{tools,posts:()=>posts,bodyCopies,states};
}
const execute=f=>runLunchBridge({tools:f.tools,recipient,pollMs:0,maxPolls:1});
test('bridge stops on existing mail before acquiring or rendering anything',async()=>{
  const f=setup({existing:true});f.tools.exec_command=()=>{throw Error('Should not collect');};
  assert.equal((await execute(f)).status,'already_sent');assert.equal(f.posts(),0);
});
test('bridge sends exact generated MIME once and persists its intent before sending',async()=>{
  const f=setup();assert.equal((await execute(f)).status,'sent_verified');assert.equal(f.posts(),1);
  assert.deepEqual(f.bodyCopies[0].payload.parts.map(p=>p.body.content),[message.plain,message.html]);
  assert.deepEqual([...f.states.values()].map(s=>s.status),['sending','sent_verified']);
});
test('ambiguous bridge send retains intent and prevents a blind retry',async()=>{
  const f=setup({sendError:true});await assert.rejects(execute(f),/response lost/);
  await assert.rejects(execute(f),/UNCERTAIN_SEND/);assert.equal(f.posts(),1);
});
test('bridge detects altered sent MIME and never claims verified delivery',async()=>{
  const f=setup({changedCopy:true});await assert.rejects(execute(f),/MIME verification/);
  assert.deepEqual([...f.states.values()].map(s=>s.status),['sending']);
});
test('bridge preview never sends and failed collectors cannot reach Gmail',async()=>{
  const f=setup();assert.equal((await runLunchBridge({tools:f.tools,recipient,mode:'preview',previewRunId:9})).status,'preview_validated');assert.equal(f.posts(),0);assert.equal(f.states.size,0);
  const failed=setup({failedCollector:true});await assert.rejects(execute(failed),/Collector failed/);assert.equal(failed.posts(),0);
});
test('concurrent bridge executions can reserve and send only one message',async()=>{
  const f=setup();await Promise.allSettled([execute(f),execute(f)]);assert.equal(f.posts(),1);
});
