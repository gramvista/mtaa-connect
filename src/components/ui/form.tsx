'use client';
import { useActionState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './button';
import type { ActionState } from '@/types/domain';
import { adminText as t } from '@/i18n/admin';

export const inputClass='mt-1 block min-h-11 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
export function ActionForm({action,children,label=t.save,className='space-y-4'}:{action:(state:ActionState,form:FormData)=>Promise<ActionState>;children:ReactNode;label?:string;className?:string}) {
 const [state,formAction,pending]=useActionState(action,{});
 const success=state.success?`${state.success}${state.id?` (${state.id})`:''}`:'';
 return <form action={formAction} className={className}>
  <fieldset disabled={pending} className="space-y-4">{children}</fieldset>
  <p role="alert" hidden={!state.error} className="text-sm text-destructive"><span>{state.error||''}</span></p>
  <p role="status" hidden={!success} className="text-sm text-primary"><span>{success}</span></p>
  <Button type="submit" disabled={pending}><span>{pending?t.saving:label}</span></Button>
 </form>;
}
