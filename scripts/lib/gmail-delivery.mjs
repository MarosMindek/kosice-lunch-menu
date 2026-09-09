import { sha256, localDate } from './menu-contract.mjs';
import { TEMPLATE_VERSION, validateBody } from '../render-email.mjs';

export const canonical=s=>String(s??'').replace(/\r\n/g,'\n').replace(/\n$/,'');
export function mailConfig(value=process.env.GMAIL_OAUTH_JSON) {
  if(!value)throw Error('SETUP_REQUIRED: configure GMAIL_OAUTH_JSON in GitHub Actions secrets');
  let c;try{c=JSON.parse(value);}catch{throw Error('Invalid GMAIL_OAUTH_JSON JSON');}
  for(const key of ['client_id','client_secret','refresh_token','from','to'])if(typeof c[key]!=='string'||!c[key])throw Error(`Missing mail configuration field: ${key}`);
  for(const key of ['from','to'])if(!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(c[key]))throw Error(`Invalid single mailbox: ${key}`);
  return c;
}
export const deliveryKey=(date,to)=>sha256(`kosice-lunch:${date}:${to.toLowerCase()}`);
const wrap64=text=>Buffer.from(text,'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';
function encodedHeader(text) {
  const chunks=[];let chunk='';
  for(const ch of text) {if(Buffer.byteLength(chunk+ch)>42){chunks.push(chunk);chunk='';}chunk+=ch;}
  if(chunk)chunks.push(chunk);
  return chunks.map(c=>`=?UTF-8?B?${Buffer.from(c).toString('base64')}?=`).join('\r\n ');
}
export function rawMessage(message,config) {
  const key=deliveryKey(message.date,config.to),boundary=`lunch-${key.slice(0,32)}`;
  const lines=[`From: ${config.from}`,`To: ${config.to}`,`Subject: ${encodedHeader(message.subject)}`,
    `Message-ID: <lunch.${key}@${config.from.split('@')[1]}>`,`Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',`X-Lunch-Date: ${message.date}`,`X-Lunch-Template: ${TEMPLATE_VERSION}`,`X-Lunch-Key: ${key}`,
    `X-Lunch-HTML-SHA256: ${sha256(canonical(message.html))}`,`X-Lunch-Plain-SHA256: ${sha256(canonical(message.plain))}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,''];
  for(const [type,body] of [['plain',message.plain],['html',message.html]])lines.push(`--${boundary}`,`Content-Type: text/${type}; charset=UTF-8`,'Content-Transfer-Encoding: base64','',wrap64(body));
  lines.push(`--${boundary}--`,'');return Buffer.from(lines.join('\r\n')).toString('base64url');
}
export function decodedMail(data) {
  const headers=Object.fromEntries((data.payload?.headers||[]).map(h=>[h.name.toLowerCase(),h.value]));
  const flatten=p=>[p,...(p?.parts||[]).flatMap(flatten)];
  const parts=flatten(data.payload),body=type=>{const p=parts.find(p=>p?.mimeType===`text/${type}`);return p?.body?.data?Buffer.from(p.body.data,'base64url').toString('utf8'):null;};
  return {headers,html:body('html'),plain:body('plain')};
}
export function validSentCopy(data,date,to) {
  const {headers:h,html,plain}=decodedMail(data);
  return !!(data.labelIds?.includes('SENT')&&h.to?.toLowerCase()===to.toLowerCase()&&h['x-lunch-date']===date&&h['x-lunch-template']===TEMPLATE_VERSION&&h['x-lunch-key']===deliveryKey(date,to)&&html&&plain&&h['x-lunch-html-sha256']===sha256(canonical(html))&&h['x-lunch-plain-sha256']===sha256(canonical(plain))&&html.includes(`${TEMPLATE_VERSION};date=${date};sha256=`));
}
export class Gmail {
  constructor(config,{fetchImpl=fetch}={}){this.config=config;this.fetch=fetchImpl;}
  async connect() {
    const {client_id,client_secret,refresh_token}=this.config;
    const r=await this.fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Error(`Gmail authorization failed (HTTP ${r.status}); reconnect credentials`);
    const token=await r.json();if(!token.access_token)throw Error('Gmail authorization returned no token');this.token=token.access_token;
    const profile=await this.request('profile');
    if(profile.emailAddress?.toLowerCase()!==this.config.from.toLowerCase())throw Error('Configured sender does not match authorized Gmail account');
  }
  async request(route,options={}) {
    const r=await this.fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+route,{...options,headers:{authorization:`Bearer ${this.token}`,'content-type':'application/json'},signal:AbortSignal.timeout(25000)});
    if(!r.ok)throw Error(`Gmail request failed (HTTP ${r.status})`);
    return r.json();
  }
  async findDelivered(date) {
    const {to}=this.config,subject=`Obedové menu – Košice | ${date.split('-').reverse().join('.')}`;
    let existingUnverified=false;
    const query=new URLSearchParams({q:`in:sent to:${to} subject:"${subject}"`,maxResults:'100'});
    for(let page=0;page<5;page++) {
      const result=await this.request('messages?'+query);
      for(const item of result.messages||[]) {
        const data=await this.request(`messages/${item.id}?format=full`),h=decodedMail(data).headers;
        if(h.subject===subject&&validSentCopy(data,date,to))return data;
        if(h.subject===subject&&data.labelIds?.includes('SENT')&&[to.toLowerCase(),`<${to.toLowerCase()}>`].some(address=>h.to?.toLowerCase()===address||h.to?.toLowerCase().endsWith(' '+address)))existingUnverified=true;
      }
      if(!result.nextPageToken) {
        if(existingUnverified)throw Error('EXISTING_MENU_REQUIRES_REVIEW: today already has a sent menu without this sender verification; refusing a duplicate');
        return null;
      }
      query.set('pageToken',result.nextPageToken);
    }
    throw Error('Gmail deduplication search exceeded its bound');
  }
  async send(message){return this.request('messages/send',{method:'POST',body:JSON.stringify({raw:rawMessage(message,this.config)})});}
  async verify(id,message) {
    for(let attempt=0;attempt<3;attempt++) {
      try {
        const data=await this.request(`messages/${id}?format=full`),copy=decodedMail(data);
        if(!validSentCopy(data,message.date,this.config.to)||copy.headers.subject!==message.subject||canonical(copy.html)!==canonical(message.html)||canonical(copy.plain)!==canonical(message.plain))throw Error('Sent MIME differs from fixed renderer output');
        return data;
      }catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
    }
  }
}
export async function deliver({menu,message,gmail,journal,now=()=>new Date()}) {
  validateBody(message,menu,{date:menu.date,now:now()});
  if(localDate(now())!==menu.date)throw Error('Service date changed before delivery');
  const existing=await gmail.findDelivered(menu.date);if(existing)return{status:'already_sent'};
  const key=deliveryKey(menu.date,gmail.config.to);
  const claim=await journal.claim(key,menu.date);
  if(!claim) {
    if(await gmail.findDelivered(menu.date))return{status:'already_sent'};
    throw Error('UNCERTAIN_SEND: a durable delivery intent already exists; refusing a blind resend');
  }
  // No retries of POST /send. A timeout may mean Gmail already accepted the message.
  if(localDate(now())!==menu.date)throw Error('Service date changed while reserving delivery');
  const result=await gmail.send(message);
  if(!result.id)throw Error('UNCERTAIN_SEND: Gmail returned no message ID');
  await gmail.verify(result.id,message);
  await journal.complete(key,menu.date,claim);
  return{status:'sent_verified'};
}
