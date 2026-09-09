// Explicit UTC schedules work independently of timezone-aware cron rollout.
// Match the schedule expression, never the actual start hour: queued jobs may start late.
export const SUMMER_SCHEDULES=['30,45 7 * * 1-5','7 8 * * 1-5'];
export const WINTER_SCHEDULES=['30,45 8 * * 1-5','7 9 * * 1-5'];
export function scheduledRunAllowed(cron,now=new Date()) {
  const offset=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Bratislava',timeZoneName:'longOffset'}).formatToParts(now).find(p=>p.type==='timeZoneName').value;
  if(!['GMT+01:00','GMT+02:00'].includes(offset))throw Error('Unexpected Bratislava UTC offset');
  return(offset==='GMT+02:00'?SUMMER_SCHEDULES:WINTER_SCHEDULES).includes(String(cron).trim().replace(/\s+/g,' '));
}
