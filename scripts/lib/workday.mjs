import { localDate, validISO, weekday } from './menu-contract.mjs';

// Act 241/1993, effective 2025-11-01, including the temporary 2026 exception.
// https://static.slov-lex.sk/static/SK/ZZ/1993/241/20251101.html
export function easterSunday(year) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
  return new Date(Date.UTC(year,month-1,day,12));
}
export function isWorkday(date=localDate()) {
  if (!validISO(date)) throw Error('Invalid service date');
  if ([0,6].includes(weekday(date))) return false;
  const year=Number(date.slice(0,4)),md=date.slice(5);
  if (year<2026) throw Error('Calendar supports service dates from 2026');
  const holidays=['01-01','01-06','05-01','07-05','08-29','11-01','12-24','12-25','12-26'];
  if(year!==2026) holidays.push('05-08','09-15');
  if(holidays.includes(md)) return false;
  const easter=easterSunday(year);
  return ![-2,1].some(offset=>new Date(+easter+offset*86400000).toISOString().slice(0,10)===date);
}
