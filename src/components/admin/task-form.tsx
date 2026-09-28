'use client';
import { useState } from 'react';
import { ActionForm,inputClass } from '@/components/ui/form';
import { createAgentTask } from '@/features/management/actions';
import { adminText as t } from '@/i18n/admin';
type Agent={id:string;full_name:string}; type Assignment={agent_id:string;mtaa_id:string;mitaa:{name:string}|null};
export function TaskForm({agents,assignments}:{agents:Agent[];assignments:Assignment[]}){
 const [agent,setAgent]=useState(agents[0]?.id||'');const available=assignments.filter(a=>a.agent_id===agent);
 return <ActionForm action={createAgentTask} label={t.createTask}>
  <label className="block text-sm">{t.agent}<select className={inputClass} name="agent_id" value={agent} onChange={e=>setAgent(e.target.value)} required><option value="">{t.select}</option>{agents.map(a=><option key={a.id} value={a.id}>{a.full_name}</option>)}</select></label>
  <label className="block text-sm">{t.title}<input className={inputClass} name="title" required maxLength={160}/></label>
  <label className="block text-sm">{t.taskDescription}<textarea className={inputClass} name="description" rows={4} maxLength={2000}/></label>
  <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">{t.priority}<select className={inputClass} name="priority"><option value="normal">{t.normal}</option><option value="high">{t.high}</option><option value="low">{t.low}</option></select></label><label className="text-sm">{t.dueDate}<input className={inputClass} type="datetime-local" name="due_at"/></label></div>
  <fieldset><legend className="text-sm font-medium">{t.assignedMitaa}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{available.map(a=><label key={a.mtaa_id} className="flex min-h-11 items-center gap-2 rounded-lg border px-3"><input type="checkbox" name="mtaa_ids" value={a.mtaa_id}/>{a.mitaa?.name}</label>)}</div>{!available.length&&<p className="mt-2 text-sm text-muted-foreground">{t.noAssignments}</p>}</fieldset>
 </ActionForm>;
}
