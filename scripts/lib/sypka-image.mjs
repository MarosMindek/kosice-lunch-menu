import {parseSypka,fingerprint} from './normalize-sources.mjs';
import {validateSource} from './menu-contract.mjs';

// Both independent readings must parse completely, including the printed date.
export function acceptSypkaImage(readings,date) {
  if(readings.length!==2||new Set(readings.map(r=>r.ocrPsm)).size!==2)throw Error('Sypka: two distinct image readings required');
  if(readings.some(r=>!r.imageSha256||r.imageSha256!==readings[0].imageSha256))throw Error('Sypka: mixed image evidence');
  const results=readings.map(raw=>{const parsed=parseSypka(raw,date);validateSource(parsed.source,date,'stara-sypka');return{raw,parsed};});
  if(fingerprint(results[0].parsed)!==fingerprint(results[1].parsed))throw Error('Sypka: image readings disagree');
  return results[0];
}
