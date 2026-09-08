// A durable compare-and-swap intent survives runner crashes and ambiguous Gmail sends.
// State contains dates and opaque hashes only; no addresses, MIME or credentials.
export class GitHubJournal {
  constructor({repository=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN,fetchImpl=fetch}={}) {
    if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||'')||!token)throw Error('SETUP_REQUIRED: GITHUB_REPOSITORY and GITHUB_TOKEN are required for durable delivery state');
    this.repository=repository;this.token=token;this.fetch=fetchImpl;this.branch='lunch-delivery-state';
  }
  async request(route,method='GET',body) {
    const res=await this.fetch(`https://api.github.com/repos/${this.repository}/${route}`,{method,headers:{authorization:`Bearer ${this.token}`,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    if(res.status===404)return null;
    if([409,422].includes(res.status))return{conflict:true};
    if(!res.ok)throw Error(`Delivery journal unavailable (HTTP ${res.status})`);
    return res.json();
  }
  async initialize() {
    if(await this.request('git/ref/heads/'+this.branch))return;
    const repo=await this.request(''),base=await this.request('git/ref/heads/'+repo.default_branch);
    await this.request('git/refs','POST',{ref:'refs/heads/'+this.branch,sha:base.object.sha});
    if(!await this.request('git/ref/heads/'+this.branch))throw Error('Delivery state branch could not be created');
  }
  path(key,date){return `contents/deliveries/${date}-${key.slice(0,20)}.json`;}
  async claim(key,date) {
    await this.initialize();
    if(await this.request(this.path(key,date)+'?ref='+this.branch))return null;
    const state={key,date,status:'sending',createdAt:new Date().toISOString()};
    const r=await this.request(this.path(key,date),'PUT',{branch:this.branch,message:'Reserve lunch delivery [skip ci]',content:Buffer.from(JSON.stringify(state)).toString('base64')});
    if(!r||r.conflict)return null;
    if(!r.content?.sha)throw Error('Delivery intent persistence was not confirmed');
    return r.content.sha;
  }
  async complete(key,date,sha) {
    const state={key,date,status:'sent_verified',verifiedAt:new Date().toISOString()};
    const r=await this.request(this.path(key,date),'PUT',{branch:this.branch,sha,message:'Confirm lunch delivery [skip ci]',content:Buffer.from(JSON.stringify(state)).toString('base64')});
    if(!r||r.conflict)throw Error('Sent mail verified but journal confirmation failed');
  }
}
