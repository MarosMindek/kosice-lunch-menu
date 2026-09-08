import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parsers} from '../scripts/lib/normalize-sources.mjs';
import {validateMenu,sha256} from '../scripts/lib/menu-contract.mjs';
import {renderEmail} from '../scripts/render-email.mjs';
import {isWorkday} from '../scripts/lib/workday.mjs';
import {agreeOCR} from '../scripts/lib/bluebell-auto.mjs';
import {mailConfig,rawMessage,validSentCopy,deliver} from '../scripts/lib/gmail-delivery.mjs';
import {GitHubJournal} from '../scripts/lib/delivery-journal.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('fixtures/'+name,import.meta.url)));
const raw={kozlovna:read('raw-kozlovna.json'),'cool-bowling':read('raw-cool-bowling.json'),tahiti:read('raw-tahiti.json')};
const fixture=read('menu-2026-09-07.json'),options={date:'2026-09-07',now:new Date('2026-09-07T12:00:00Z')};
const message=renderEmail(fixture,options),config={client_id:'client',client_secret:'secret',refresh_token:'refresh',from:'sender@example.com',to:'recipient@example.com'};

test('all published weekdays parse without a model, including desserts and side dishes',()=>{
  for(const date of ['2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11']) {
    for(const [id,r] of Object.entries(raw)) {
      const parsed=parsers[id](r,date);assert.ok(parsed.mains.length>=4);assert.equal(parsed.soups.length,2);
      if(id==='cool-bowling')assert.equal(parsed.desserts.length,2);
    }
  }
  const k=parsers.kozlovna(raw.kozlovna,options.date);
  assert.ok(k.mains[0].description.includes('pečenými zemiakmi'));
  const generated={date:options.date,restaurants:[k,parsers['cool-bowling'](raw['cool-bowling'],options.date),parsers.tahiti(raw.tahiti,options.date),fixture.restaurants.find(r=>r.id==='bluebell')]};
  assert.doesNotThrow(()=>renderEmail(generated,options));
});
test('new unrecognized rows and missing prices stop automatic parsing',()=>{
  const c=structuredClone(raw['cool-bowling']);c.lines.splice(c.lines.findIndex(s=>s.startsWith('08.09.26')),0,'New meal 5,00 €');
  assert.throws(()=>parsers['cool-bowling'](c,options.date),/unparsed/);
  const t=structuredClone(raw.tahiti);t.lines=t.lines.filter(s=>s!=='16.90 €');
  assert.throws(()=>parsers.tahiti(t,options.date),/price/);
});
test('Sypka current PDF retains wrapped meals and handles prices beside portions',()=>{
  const raw=read('raw-sypka.json');
  for(const pdfText of [raw.pdfText,raw.pdfText.replaceAll(')\n',') ')]) {
    const parsed=parsers['stara-sypka']({...raw,pdfText},'2026-09-08');
    assert.equal(parsed.soups.length,1);assert.equal(parsed.mains.length,6);
    assert.deepEqual(parsed.mains.map(i=>i.price),[8.9,9.2,9.5,10.2,8.9,12.9]);
    assert.ok(parsed.mains.some(i=>i.name.includes('UHORKOVÝ ŠALÁT')));
  }
});
test('Slovak calendar includes Easter and the enacted 2026 exceptions',()=>{
  for(const d of ['2026-01-01','2026-01-06','2026-04-03','2026-04-06','2026-05-01','2026-12-24','2026-09-12'])assert.equal(isWorkday(d),false,d);
  for(const d of ['2026-05-08','2026-09-01','2026-09-08','2026-09-15','2026-11-17'])assert.equal(isWorkday(d),true,d);
  assert.equal(isWorkday('2027-09-15'),false);
});
test('automatic Bluebell acceptance requires two distinct agreeing high-confidence readings',()=>{
  const b=fixture.restaurants.find(r=>r.id==='bluebell'),text=fs.readFileSync(new URL('fixtures/bluebell-current-ocr.txt',import.meta.url),'utf8');
  const candidate={href:b.source.url,ownerUrl:b.source.ownerUrl,identityText:b.source.identityText,imageSha256:b.source.imageSha256,capturedAt:b.source.capturedAt};
  const one={text,confidence:95,psm:6,inputSha256:'a'.repeat(64)},two={...one,psm:11};
  assert.equal(agreeOCR([one],candidate,options.date),null);
  assert.equal(agreeOCR([one,one],candidate,options.date),null);
  assert.equal(agreeOCR([one,{...two,confidence:50}],candidate,options.date),null);
  const accepted=agreeOCR([one,two],candidate,options.date);assert.equal(accepted.needsVisualReview,false);
  assert.equal(accepted.validation,'tesseract-consensus-v1');
  assert.equal(agreeOCR([one,{...two,text:text.replace('11,90€','12,90€')}],candidate,options.date),null);
  assert.equal(agreeOCR([one,two],candidate,'2026-09-14'),null);
});
function sentCopy(msg=message) {
  const raw=Buffer.from(rawMessage(msg,config),'base64url').toString('utf8'),head=raw.split('\r\n\r\n')[0].replace(/\r\n /g,'');
  const headers=head.split('\r\n').map(line=>{const i=line.indexOf(':');return{name:line.slice(0,i),value:line.slice(i+1).trim().replace(/=\?UTF-8\?B\?([^?]+)\?=/g,(_,s)=>Buffer.from(s,'base64').toString('utf8'))};});
  return{labelIds:['SENT'],payload:{headers,parts:[{mimeType:'text/plain',body:{data:Buffer.from(msg.plain).toString('base64url')}},{mimeType:'text/html',body:{data:Buffer.from(msg.html).toString('base64url')}}]}};
}
test('Gmail MIME preserves the exact template and rejects altered or legacy copies',()=>{
  const copy=sentCopy();assert.equal(validSentCopy(copy,options.date,config.to),true);
  assert.equal(copy.payload.headers.find(h=>h.name==='Subject').value,message.subject);
  copy.payload.parts[1].body.data=Buffer.from(message.html.replace('8,90 €','9,90 €')).toString('base64url');
  assert.equal(validSentCopy(copy,options.date,config.to),false);
  assert.equal(validSentCopy({labelIds:['SENT'],payload:{headers:[],parts:[]}},options.date,config.to),false);
  assert.throws(()=>mailConfig(JSON.stringify({...config,to:'a@example.com\r\nBcc: b@example.com'})),/mailbox/);
});
test('the real Facebook image passes on two original readings without a manual backup',()=>{
  const {candidate,passes}=read('bluebell-live-consensus.json');
  const accepted=agreeOCR(passes.slice(0,2),candidate,'2026-09-08');
  assert.ok(accepted);assert.equal(accepted.soups[0].name,'Kurací Vývar');
  assert.deepEqual(accepted.mains.map(i=>i.price),[11.9,8.9,8.9,8.9,9.9]);
  assert.deepEqual(accepted.mains.map(i=>i.portion),['180/100/100/50g','250/250/50g','120/250/50g','150/100/100g','180/250/50g']);
  assert.equal(accepted.source.kind,'image-ocr');assert.equal(accepted.source.ocrEvidence.length,2);
  // The optional transformed reading misreads the r as ľ; it is unnecessary after agreement.
  assert.equal(agreeOCR([passes[0],passes[2]],candidate,'2026-09-08'),null);
});
const now=()=>options.now;
function fakes() {
  const state=new Map();let posts=0,indexed=false;
  return{
    journal:{async claim(key){if(state.has(key))return null;state.set(key,'sending');return'claim';},async complete(key){state.set(key,'sent_verified');}},
    gmail:{config,async findDelivered(){return indexed?sentCopy():null;},async send(){posts++;return{id:'sent-id'};},async verify(){indexed=true;}},
    posts:()=>posts,state,index:()=>indexed=true
  };
}
test('complete delivery verifies the sent copy and repeated execution sends only once',async()=>{
  const f=fakes();assert.equal((await deliver({menu:fixture,message,...f,now})).status,'sent_verified');
  assert.equal((await deliver({menu:fixture,message,...f,now})).status,'already_sent');assert.equal(f.posts(),1);
});
test('durable intents prevent duplicates after an ambiguous send or concurrent execution',async()=>{
  const f=fakes();f.gmail.send=async()=>{throw Error('network response lost');};
  await assert.rejects(deliver({menu:fixture,message,...f,now}),/lost/);
  await assert.rejects(deliver({menu:fixture,message,...f,now}),/UNCERTAIN_SEND/);
  f.index();assert.equal((await deliver({menu:fixture,message,...f,now})).status,'already_sent');
  const concurrent=fakes();await Promise.allSettled([deliver({menu:fixture,message,...concurrent,now}),deliver({menu:fixture,message,...concurrent,now})]);assert.equal(concurrent.posts(),1);
});
test('a changed outgoing body or midnight transition cannot reach the sender',async()=>{
  const f=fakes();await assert.rejects(deliver({menu:fixture,message:{...message,html:'changed'},...f,now}));
  await assert.rejects(deliver({menu:fixture,message,...f,now:()=>new Date('2026-09-07T22:01:00Z')}));assert.equal(f.posts(),0);
});
test('GitHub journal persists across instances without storing recipient or message content',async()=>{
  const files=new Map();
  const fetchImpl=async(url,opts)=>{
    if(url.includes('/git/ref/'))return new Response(JSON.stringify({object:{sha:'head'}}));
    const key=url.split('/contents/')[1]?.split('?')[0];
    if(opts.method==='GET')return files.has(key)?new Response(JSON.stringify(files.get(key))):new Response('',{status:404});
    const body=JSON.parse(opts.body),existing=files.get(key);
    if(existing&&!body.sha)return new Response('',{status:409});
    const content=JSON.parse(Buffer.from(body.content,'base64').toString());
    assert.ok(!JSON.stringify(content).includes(config.to));assert.ok(!JSON.stringify(content).includes(message.html));
    files.set(key,{sha:'persisted',content});return new Response(JSON.stringify({content:{sha:'persisted'}}));
  };
  const args={repository:'owner/repo',token:'test',fetchImpl},one=new GitHubJournal(args),two=new GitHubJournal(args),key='a'.repeat(64);
  assert.equal(await one.claim(key,options.date),'persisted');assert.equal(await two.claim(key,options.date),null);
  await one.complete(key,options.date,'persisted');assert.equal([...files.values()][0].content.status,'sent_verified');
});
test('the existing email design is pinned byte for byte',()=>{
  const template=fs.readFileSync(new URL('../templates/email-v1.html',import.meta.url));
  assert.equal(sha256(template),fs.readFileSync(new URL('../templates/email-v1.sha256',import.meta.url),'utf8').trim());
});
