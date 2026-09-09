import fs from 'node:fs';
const file='output/autonomous/status.json';
const status=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
if(process.env.GITHUB_STEP_SUMMARY) {
  const lines=['## Lunch delivery',`Run: ${process.env.GITHUB_EVENT_NAME}`,`Status: ${status?.status||'No collection output; see preflight and setup steps'}`];
  if(status?.date)lines.push(`Menu date: ${status.date}`);
  if(status?.error)lines.push(`Error: ${status.error}`);
  for(const r of status?.counts||[])lines.push(`${r.id}: ${r.soups} soups, ${r.mains} mains, ${r.desserts} desserts`);
  if(status?.mailSecretPresent===false)lines.push('Gmail setup is missing: [connection guide](https://github.com/MarosMindek/kosice-lunch-menu/blob/main/docs/AUTONOMOUS.md#jednorazové-pripojenie-gmailu). A validated preview is not a sent email.');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n\n')+'\n');
}
