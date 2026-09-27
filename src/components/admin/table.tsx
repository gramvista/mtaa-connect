import Link from 'next/link';
import { adminText as t,statusLabel } from '@/i18n/admin';
export function Status({value}:{value:string}) {
 return <span className="inline-flex rounded-full border bg-muted px-2 py-1 text-xs whitespace-nowrap">{statusLabel(value)}</span>;
}
export function Pagination({page,count,path,params={}}:{page:number;count:number;path:string;params?:Record<string,string>}) {
 const href=(p:number)=>path+'?'+new URLSearchParams({...params,page:String(p)});
 return <div className="flex items-center gap-4 text-sm"><span>{t.page} {page} · {count}</span>{page>1&&<Link className="underline" href={href(page-1)}>{t.previous}</Link>}{page*25<count&&<Link className="underline" href={href(page+1)}>{t.next}</Link>}</div>;
}
export const tableClass='w-full text-left text-sm [&_th]:border-b [&_th]:px-3 [&_th]:py-3 [&_th]:font-semibold [&_td]:border-b [&_td]:px-3 [&_td]:py-4';
export function getPage(value?:string) {const page=Number(value);return Number.isInteger(page)&&page>0?Math.min(page,100000):1;}
