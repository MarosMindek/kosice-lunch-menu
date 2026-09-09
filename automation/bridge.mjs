// Fixed orchestration for the connected GitHub/Gmail tools. No model reads or writes menu content.
// Called by Work Mode with its tools object; also importable by Node tests.
const REPO='MarosMindek/kosice-lunch-menu';
const BASE='https://api.github.com/repos/'+REPO;
const PIN='917fcfe0c6ea2a1ba267781501bcf66a66ca924be3deb03808cf22d599d68a0d';
const FILES=['scripts/render-email.mjs','scripts/lib/menu-contract.mjs','scripts/lib/workday.mjs','templates/email-v1.html','templates/email-v1.sha256'];
const quote=s=>"'"+String(s).replace(/'/g,"'\\''")+"'";
const canonical=s=>String(s??'').replace(/\r\n/g,'\n').replace(/\n$/,'');
const flatten=p=>[p,...(p?.parts||[]).flatMap(flatten)];
export async function runLunchBridge({tools,recipient,mode='send',previewRunId=null,emit=()=>{},pollMs=30000,maxPolls=40}) {
  if(!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(recipient||''))throw Error('One verified recipient is required');
  if(!['send','preview'].includes(mode)||previewRunId&&mode!=='preview')throw Error('Invalid bridge mode');
  const call=async(name,args)=>{const r=await tools[name](args);if(r.isError)throw Error(name+': '+JSON.stringify(r.structuredContent||r.content));return r.structuredContent?.result||r.structuredContent;};
  const get=async route=>JSON.parse((await call('mcp__codex_apps__github_fetch',{url:BASE+route})).content);
  const shell=async(cmd,options={})=>{
    let r=await tools.exec_command({cmd,max_output_tokens:30000,...options}),output=r.output;
    while(r.session_id&&r.exit_code===undefined){r=await tools.write_stdin({session_id:r.session_id,chars:'',yield_time_ms:1000,max_output_tokens:30000});output+=r.output;}
    if(r.exit_code!==0)throw Error('Local validation failed: '+output);return output.trim();
  };
  const date=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bratislava',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return`${p.year}-${p.month}-${p.day}`;};
  const today=date(),subject='Obedové menu – Košice | '+today.split('-').reverse().join('.');
  async function existing() {
    const r=await call('mcp__codex_apps__gmail_search_emails',{query:`in:sent to:${recipient} subject:"${subject}"`,max_results:25});
    return r.emails.find(m=>m.subject===subject&&m.labels?.includes('SENT')&&m.to?.some(a=>a.toLowerCase()===recipient.toLowerCase()));
  }
  // A mail sent by either delivery route stops the next attempt before collection.
  if(mode==='send'){const prior=await existing();if(prior)return{status:'already_sent',date:today,messageId:prior.id};}
  const root=await shell("python3 -c 'import tempfile,os;print(tempfile.mkdtemp(prefix=\"lunch-bridge-\",dir=os.getcwd()))'");
  async function installValidator(ref) {
    const responses=await Promise.allSettled(FILES.map(async path=>[path,(await call('mcp__codex_apps__github_fetch_file',{repository_full_name:REPO,path,ref})).content]));
    for(const r of responses)if(r.status==='rejected')throw r.reason;
    const files=Object.fromEntries(responses.map(r=>r.value));
    await shell('python3 -c '+quote('import json,pathlib,sys\nr=pathlib.Path(sys.argv[1])\nfor p,c in json.loads(sys.argv[2]).items():\n f=r/p;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(c)')+' '+quote(root)+' '+quote(JSON.stringify(files)));
  }
  await installValidator('main');
  const preflight=JSON.parse(await shell('node --input-type=module -e '+quote("import {isWorkday} from './scripts/lib/workday.mjs';import {localDate} from './scripts/lib/menu-contract.mjs';console.log(JSON.stringify({date:localDate(),workday:isWorkday()}));"),{workdir:root}));
  if(preflight.date!==today)throw Error('Date changed during preflight');
  if(!preflight.workday)return{status:'non_workday',date:today};
  let run;
  if(previewRunId)run=await get('/actions/runs/'+previewRunId);
  else {
    const runs=(await get('/actions/runs?per_page=30')).workflow_runs;
    run=runs.find(r=>r.path==='.github/workflows/daily-lunch.yml'&&r.event==='push'&&r.status==='completed');
    if(!run)throw Error('No completed collector build is available');
    const previousAttempt=run.run_attempt,started=Date.now();
    const jobs=await call('mcp__codex_apps__github_fetch_workflow_run_jobs',{repo_full_name:REPO,run_id:run.id});
    const job=jobs.jobs.find(j=>j.name==='lunch');if(!job)throw Error('Collector job missing');
    await call('mcp__codex_apps__github_rerun_workflow_job',{repo_full_name:REPO,job_id:job.id});
    emit({phase:'collecting',runId:run.id});
    for(let i=0;i<maxPolls;i++) {
      await new Promise(r=>setTimeout(r,pollMs));run=await get('/actions/runs/'+run.id);
      if(run.run_attempt>previousAttempt&&run.status==='completed')break;
      if(i%2===1)emit({phase:'collecting',elapsedSeconds:Math.round((Date.now()-started)/1000)});
    }
    if(run.run_attempt<=previousAttempt||run.status!=='completed')throw Error('Collector did not finish within the bounded wait');
  }
  if(run.event!=='push'||run.conclusion!=='success')throw Error('Collector failed; no email will be assembled manually');
  const artifacts=(await call('mcp__codex_apps__github_fetch_workflow_run_artifacts',{repo_full_name:REPO,run_id:run.id})).artifacts;
  const artifact=artifacts.filter(a=>!a.expired&&a.name===`lunch-${run.id}-${run.run_attempt}`).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
  if(!artifact)throw Error('Validated artifact for this exact run attempt is missing');
  const download=await call('mcp__codex_apps__github_download_workflow_artifact',{repo_full_name:REPO,artifact_id:artifact.id,file_name:'lunch.zip'});
  const url=download.file_uri.download_url;
  await shell('curl --fail --silent --show-error --location --max-time 60 '+quote(url)+' --output '+quote(root+'/lunch.zip'));
  await shell('python3 -c '+quote('import zipfile,pathlib,sys\nr=pathlib.Path(sys.argv[1]);z=r/"lunch.zip"\nwith zipfile.ZipFile(z) as f:\n for n in f.namelist():\n  p=pathlib.PurePosixPath(n)\n  if p.is_absolute() or ".." in p.parts:raise ValueError("Unsafe ZIP path")\n f.extractall(r/"artifact")')+' '+quote(root)+' '+quote(url));
  // Recompute the exact HTML and plain text using the same build that created the artifact.
  await installValidator(run.head_sha);
  const validation="import fs from 'node:fs';import {renderEmail,validateBody} from './scripts/render-email.mjs';import {localDate,sha256} from './scripts/lib/menu-contract.mjs';const p='artifact/autonomous/';const read=n=>JSON.parse(fs.readFileSync(p+n));const status=read('status.json'),menu=read('normalized-menu.json'),message=read('email.json');if(status.status!=='dry_run_validated'||status.date!==localDate()||menu.date!==localDate())throw Error('Fresh validated menu missing');if(sha256(fs.readFileSync('templates/email-v1.html'))!==process.argv[1])throw Error('Fixed template changed');validateBody(message,menu);console.log(JSON.stringify({message,key:sha256('kosice-lunch:'+menu.date+':'+process.argv[2].toLowerCase()),counts:status.counts}));";
  const {message,key,counts}=JSON.parse(await shell('node --input-type=module -e '+quote(validation)+' '+quote(PIN)+' '+quote(recipient),{workdir:root}));
  if(message.date!==today||date()!==today)throw Error('Date changed before delivery');
  emit({phase:'validated',date:today,restaurants:counts.length});
  if(mode==='preview')return{status:'preview_validated',date:today,counts,runId:run.id,templateVersion:message.templateVersion};
  const prior=await existing();if(prior)return{status:'already_sent',date:today,messageId:prior.id};
  const branch='lunch-delivery-state',receipt=`deliveries/${today}-${key.slice(0,20)}.json`;
  let branchRef;
  try{branchRef=await get('/git/ref/heads/'+branch);}
  catch(e){
    if(!/404|NOT_FOUND|Not Found/.test(e.message))throw e;
    const main=await get('/git/ref/heads/main');
    try{await call('mcp__codex_apps__github_create_branch',{repository_full_name:REPO,branch_name:branch,sha:main.object.sha});}catch{}
    branchRef=await get('/git/ref/heads/'+branch);
  }
  const receiptResult=await tools.mcp__codex_apps__github_fetch_file({repository_full_name:REPO,path:receipt,ref:branchRef.object.sha});
  if(!receiptResult.isError)throw Error('UNCERTAIN_SEND: delivery intent already exists; refusing a blind resend');
  if(!/404|NOT_FOUND|Not Found/.test(JSON.stringify(receiptResult)))throw Error('Could not establish absence of a delivery intent');
  async function journal(parent,status) {
    const commit=await get('/git/commits/'+parent);
    const tree=await call('mcp__codex_apps__github_create_tree',{repository_full_name:REPO,base_tree_sha:commit.tree.sha,tree_elements:[{path:receipt,mode:'100644',type:'blob',content:JSON.stringify({key,date:today,status,updatedAt:new Date().toISOString()})}]});
    const c=await call('mcp__codex_apps__github_create_commit',{repository_full_name:REPO,parent_sha:parent,tree_sha:tree.sha,message:'Record lunch delivery state [skip ci]'});
    await call('mcp__codex_apps__github_update_ref',{repository_full_name:REPO,branch_name:branch,sha:c.sha,force:false});return c.sha;
  }
  const claim=await journal(branchRef.object.sha,'sending');
  if(date()!==today)throw Error('Date changed after reserving delivery');
  // Never retry send: the durable claim remains if the response is lost.
  const sent=await call('mcp__codex_apps__gmail_send_email',{to:recipient,subject:message.subject,payload:{mime_type:'multipart/alternative',parts:[{mime_type:'text/plain',charset:'utf-8',body:{content:message.plain}},{mime_type:'text/html',charset:'utf-8',body:{content:message.html}}]},response_fields:['id','thread_id','label_ids']});
  if(!sent.id)throw Error('UNCERTAIN_SEND: no message ID returned');
  const copy=await call('mcp__codex_apps__gmail_read_email',{message_id:sent.id,format:'full'}),parts=flatten(copy.payload),headers=Object.fromEntries((copy.payload?.headers||[]).map(h=>[h.name.toLowerCase(),h.value]));
  if(!copy.label_ids?.includes('SENT')||headers.subject!==message.subject||headers.to?.toLowerCase()!==recipient.toLowerCase()||canonical(parts.find(p=>p.mime_type==='text/html')?.body?.content)!==canonical(message.html)||canonical(parts.find(p=>p.mime_type==='text/plain')?.body?.content)!==canonical(message.plain))throw Error('Sent MIME verification failed; no resend attempted');
  await journal(claim,'sent_verified');
  return{status:'sent_verified',date:today,messageId:sent.id,counts,templateVersion:message.templateVersion};
}
