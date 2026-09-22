import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute=promisify(execFile);
const token=process.env.GITHUB_TOKEN;
const repository=process.env.GITHUB_REPOSITORY;
const ids=['kozlovna','cool-bowling','tahiti','stara-sypka'];
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bratislava',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const destination=path.join('results','source-cache',date,'sources.json');
const headers={accept:'application/vnd.github+json','x-github-api-version':'2022-11-28',authorization:`Bearer ${token}`};

function findSources(dir) {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const target=path.join(dir,entry.name);
    if(entry.isDirectory()) {
      const found=findSources(target);
      if(found)return found;
    } else if(entry.name==='sources.json'&&target.includes('autonomous')) return target;
  }
  return null;
}

async function main() {
  if(!token||!repository) {
    console.log(JSON.stringify({status:'skipped',reason:'GitHub runtime credentials unavailable'}));
    return;
  }
  const response=await fetch(`https://api.github.com/repos/${repository}/actions/artifacts?per_page=100`,{headers});
  if(!response.ok)throw Error(`artifact list HTTP ${response.status}`);
  const artifacts=(await response.json()).artifacts
    .filter(a=>!a.expired&&a.name.startsWith('stable-menu-')&&a.size_in_bytes<=25*1024*1024)
    .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at))
    .slice(0,12);
  const sources={};
  for(const artifact of artifacts) {
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lunch-source-cache-'));
    try {
      const download=await fetch(artifact.archive_download_url,{headers});
      if(!download.ok)continue;
      const zip=path.join(temp,'artifact.zip'),expanded=path.join(temp,'expanded');
      fs.writeFileSync(zip,Buffer.from(await download.arrayBuffer()));
      fs.mkdirSync(expanded);
      await execute('unzip',['-q',zip,'-d',expanded],{timeout:30000});
      const file=findSources(expanded);
      if(!file)continue;
      const candidate=JSON.parse(fs.readFileSync(file,'utf8'));
      if(candidate.date!==date)continue;
      for(const id of ids)if(!sources[id]&&candidate.sources?.[id])sources[id]=candidate.sources[id];
      if(ids.every(id=>sources[id]))break;
    } catch(error) {
      console.log(JSON.stringify({status:'artifact_rejected',artifactId:artifact.id,error:error.message}));
    } finally {
      fs.rmSync(temp,{recursive:true,force:true});
    }
  }
  if(!Object.keys(sources).length) {
    console.log(JSON.stringify({status:'empty',date}));
    return;
  }
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,JSON.stringify({date,restoredAt:new Date().toISOString(),sources},null,2));
  console.log(JSON.stringify({status:'restored',date,restaurants:Object.keys(sources)}));
}

main().catch(error=>{
  console.log(JSON.stringify({status:'unavailable',error:error.message}));
});
