import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshSnapshot} from '../automation/refresh-snapshot.mjs';
const date='2026-10-26',ok=structuredContent=>({structuredContent});
function fixture({ready=false,active=false,failed=false,obsolete=false,missingRestaurant=false,bluebellUnavailable=false,invalidBluebellFallback=false}={}) {
  let reruns=0,attempt=1,finished=false;
  const run=()=>({id:99,path:'.github/workflows/stable-menu-snapshot.yml',head_branch:'main',head_sha:'build',run_attempt:attempt,status:active&&!finished?'in_progress':'completed',conclusion:failed?'failure':'success'});
  const tools={
    async mcp__codex_apps__github_fetch_file({path}) {
      if(!ready&&!finished)return {isError:true,structuredContent:{error:'404 Not Found'}};
      const restaurants=['kozlovna','cool-bowling','tahiti'].map(id=>({id,reviewedComplete:true,soups:[{}],mains:[{}]}));
      if(!missingRestaurant)restaurants.push(bluebellUnavailable?{id:'bluebell',unavailable:true,source:{url:invalidBluebellFallback?'https://example.com/menu':'https://www.facebook.com/pivarenbluebell/'},soups:[],mains:[],desserts:[],notes:[]}:{id:'bluebell',reviewedComplete:true,soups:[{}],mains:[{}]});
      const data=path.endsWith('status.json')?{status:'dry_run_validated',date}:path.endsWith('email.json')?{date,subject:'Obedové menu – Košice | 26.10.2026'}:{date,restaurants};
      return ok({content:JSON.stringify(data)});
    },
    async mcp__codex_apps__github_fetch({url}) {
      let value;
      if(url.includes('/actions/runs?'))value={workflow_runs:[run()]};
      else if(url.includes('/git/trees/'))value={tree:[{type:'blob',path:'scripts/lunch.mjs',sha:obsolete&&url.includes('/main?')?'changed':'same'}]};
      else {finished=true;value=run();}
      return ok({content:JSON.stringify(value)});
    },
    async mcp__codex_apps__github_fetch_workflow_run_jobs(){return ok({jobs:[{id:123,name:'snapshot'}]});},
    async mcp__codex_apps__github_rerun_workflow_job(){reruns++;attempt++;return ok({success:true});}
  };
  return {tools,reruns:()=>reruns};
}
const execute=f=>refreshSnapshot({tools:f.tools,date,pollMs:0,maxPolls:2});
test('Monday refresh acquires new weekly evidence instead of stopping on absent cache',async()=>{
  const f=fixture();assert.equal((await execute(f)).status,'snapshot_ready');assert.equal(f.reruns(),1);
});
test('complete snapshot and a BlueBell source-link fallback are both reusable',async()=>{
  for(const flags of [{ready:true},{ready:true,bluebellUnavailable:true}]) {
    const f=fixture(flags);assert.equal((await execute(f)).status,'snapshot_ready');assert.equal(f.reruns(),0);
  }
});
test('in-progress collection is awaited without starting a competing attempt',async()=>{
  const f=fixture({active:true});assert.equal((await execute(f)).status,'snapshot_ready');assert.equal(f.reruns(),0);
});
test('failed, obsolete or incomplete collection never reports a ready snapshot',async()=>{
  for(const flags of [{failed:true},{obsolete:true},{missingRestaurant:true},{bluebellUnavailable:true,invalidBluebellFallback:true}])await assert.rejects(execute(fixture(flags)),/failed|obsolete|complete same-day/);
});
