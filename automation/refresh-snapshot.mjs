// Acquisition only: never sends email or edits cached menu evidence itself.
const REPO='MarosMindek/kosice-lunch-menu';
const BASE='https://api.github.com/repos/'+REPO;
const WORKFLOW='.github/workflows/stable-menu-snapshot.yml';
const required=date=>['kozlovna','cool-bowling','tahiti','bluebell',...(new Date(date+'T12:00:00Z').getUTCDay()===1?[]:['stara-sypka'])];
const unwrap=r=>{if(r.isError)throw Error(JSON.stringify(r.structuredContent||r.content));let d=r.structuredContent;while(d?.structuredContent)d=d.structuredContent;return d?.result||d;};

export async function refreshSnapshot({tools,date,emit=()=>{},pollMs=30000,maxPolls=40}) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('An explicit service date is required');
  const call=async(name,args)=>unwrap(await tools[name](args));
  const get=async route=>JSON.parse((await call('mcp__codex_apps__github_fetch',{url:BASE+route})).content);
  async function snapshot() {
    const records={};
    for(const name of ['status.json','normalized-menu.json','email.json']) {
      const r=await tools.mcp__codex_apps__github_fetch_file({repository_full_name:REPO,path:`results/stable-menu/${date}/${name}`,ref:'main'});
      if(r.isError) {
        if(/404|NOT_FOUND|Not Found/.test(JSON.stringify(r)))return null;
        unwrap(r);
      }
      records[name]=JSON.parse(unwrap(r).content);
    }
    const status=records['status.json'],menu=records['normalized-menu.json'],email=records['email.json'];
    if(status.status!=='dry_run_validated'||status.date!==date||menu.date!==date||email.date!==date||email.subject!==`Obedové menu – Košice | ${date.split('-').reverse().join('.')}`)return null;
    if(!required(date).every(id=>menu.restaurants?.some(r=>r.id===id&&!r.closed&&r.reviewedComplete&&r.soups?.length&&r.mains?.length)))return null;
    return {status:'snapshot_ready',date,path:`results/stable-menu/${date}`};
  }
  const cached=await snapshot();if(cached)return cached;
  // The connected GitHub reader exposes the runs collection, not workflow metadata.
  // Page through it so unrelated workflows do not hide the latest collector.
  let run;
  for(let page=1;page<=3&&!run;page++) {
    const runs=(await get(`/actions/runs?branch=main&per_page=100&page=${page}`)).workflow_runs;
    run=runs.find(r=>r.path===WORKFLOW&&r.head_branch==='main');
    if(runs.length<100)break;
  }
  if(!run)throw Error('No stable snapshot build exists');
  // Reruns use their original commit. Never silently run an obsolete collector.
  const [current,build]=await Promise.all(['main',run.head_sha].map(ref=>get('/git/trees/'+ref+'?recursive=1')));
  const code=t=>JSON.stringify(t.tree.filter(x=>x.type==='blob'&&(/^(scripts|templates|data)\//.test(x.path)||x.path==='package.json'||x.path===WORKFLOW||x.path==='.github/scripts/restore-source-cache.mjs')).map(x=>[x.path,x.sha]).sort());
  if(current.truncated||build.truncated||code(current)!==code(build))throw Error('Collector build is obsolete; a current-main build is required');
  const previousAttempt=run.run_attempt;
  let launched=false;
  if(run.status==='completed') {
    const jobs=await call('mcp__codex_apps__github_fetch_workflow_run_jobs',{repo_full_name:REPO,run_id:run.id});
    const job=jobs.jobs.find(j=>j.name==='snapshot');if(!job)throw Error('Snapshot job missing');
    await call('mcp__codex_apps__github_rerun_workflow_job',{repo_full_name:REPO,job_id:job.id});
    launched=true;
  }
  emit({phase:'refreshing_snapshot',runId:run.id,launched});
  for(let i=0;i<maxPolls;i++) {
    await new Promise(resolve=>setTimeout(resolve,pollMs));
    run=await get('/actions/runs/'+run.id);
    if(run.status==='completed'&&(!launched||run.run_attempt>previousAttempt)) {
      if(run.conclusion!=='success')throw Error(`Snapshot collection failed: run ${run.id}, attempt ${run.run_attempt}, ${run.conclusion}; inspect job logs and results/source-cache/${date}/diagnostics.json`);
      const fresh=await snapshot();
      if(!fresh)throw Error('Collector completed without a complete same-day snapshot');
      return {...fresh,runId:run.id,attempt:run.run_attempt};
    }
    if(i%2===1)emit({phase:'refreshing_snapshot',runId:run.id,status:run.status});
  }
  throw Error(`Snapshot collection did not finish within the bounded wait: ${run.id}`);
}
