// Run once on your own computer. Never paste credentials into a chat or commit them.
import fs from 'node:fs';
import http from 'node:http';
import { randomBytes,createHash } from 'node:crypto';
import { mailConfig } from './lib/gmail-delivery.mjs';
const [clientFile,from,to]=process.argv.slice(2);
if(!clientFile||!from||!to)throw Error('Usage: node scripts/setup-gmail.mjs client_secret.json sender@example.com recipient@example.com');
const client=JSON.parse(fs.readFileSync(clientFile,'utf8')).installed;
if(!client?.client_id||!client.client_secret)throw Error('Use an OAuth Desktop application client JSON');
const state=randomBytes(24).toString('base64url'),verifier=randomBytes(48).toString('base64url');
const server=http.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const redirect=`http://127.0.0.1:${server.address().port}`;
const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
url.search=new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
console.log('Open this Google authorization page on this computer:\n'+url.href);
const timer=setTimeout(()=>{server.close();console.error('Authorization timed out; run setup again.');process.exitCode=1;},10*60*1000);
server.on('request',async(req,res)=>{
  const callback=new URL(req.url,redirect);
  if(callback.pathname!=='/'||callback.searchParams.get('state')!==state){res.writeHead(400).end('Invalid authorization callback');return;}
  try {
    const code=callback.searchParams.get('code');if(!code)throw Error('Authorization was not granted');
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:client.client_id,client_secret:client.client_secret,code,code_verifier:verifier,redirect_uri:redirect,grant_type:'authorization_code'}),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error('Google token exchange failed');
    const result=await response.json();if(!result.refresh_token)throw Error('Google returned no refresh token');
    const config={client_id:client.client_id,client_secret:client.client_secret,refresh_token:result.refresh_token,from,to};mailConfig(JSON.stringify(config));
    fs.writeFileSync('gmail-oauth.json',JSON.stringify(config,null,2),{mode:0o600,flag:'wx'});
    res.writeHead(200,{'content-type':'text/plain; charset=utf-8'}).end('Gmail connection saved locally. You may close this window.');
    console.log('Created gmail-oauth.json. Upload it as the GMAIL_OAUTH_JSON repository secret. No secret was printed.');
  }catch(e){res.writeHead(400).end('Setup did not complete. Check the terminal.');console.error(e.message);process.exitCode=1;}
  finally{clearTimeout(timer);server.close();}
});
