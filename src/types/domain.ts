export type Profile = { id: string; full_name: string; email?: string | null; role: 'super_admin' | 'mtaa_admin' | 'agent'; mtaa_id: string | null; status: 'active' | 'suspended' };
export type Location = { id: string; name: string; status?: string; region_id?: string; district_id?: string; ward_id?: string; mtaa_id?: string | null; balozi_name?: string };
export type GroupingField = { id: string; mtaa_id: string | null; name: string; status: string };
export type GroupingValue = { id: string; field_id: string; name: string; status: string };
export type Occupation = { code: string; name: string; requires_detail: boolean; sort_order?: number; status?: string };
export type Resident = {
 id: string; full_name: string; phone_number: string; mtaa_id: string; balozi_area_id: string | null;
 status: string; registration_status: string; category_ids: string[]; category_names: string;
 region_name: string; district_name: string; ward_name: string; mtaa_name: string;
 balozi_name: string; balozi_area_name: string; balozi_leader_name: string;
 subscription_status: string; expires_at: string | null;
 group_value_ids: string[]; group_names: string;
 occupation_codes: string[]; occupation_names: string; occupation_other: string;
};
export type Campaign = { id: string; mtaa_id: string; title: string; message: string; status: string; total_recipients: number; units_per_message: number; sent_count: number; delivered_count: number; failed_count: number; created_at: string };
export type ActionState = { error?: string; success?: string; id?: string; url?: string };
export type AgentCommission = { id:string;amount:300;currency:'TZS';status:'earned'|'paid'|'cancelled';earned_at:string;paid_at:string|null;resident_id:string;payment_id:string };
export type AgentAssignment = { id:string;agent_id:string;mtaa_id:string;status:'active'|'inactive';mitaa?:{name:string}|null };
export type AgentTask = { id:string;title:string;description:string;agent_id:string;status:'pending'|'in_progress'|'completed'|'cancelled';priority:'low'|'normal'|'high';due_at:string|null;created_at:string;agent_task_mitaa?:{mtaa_id:string;mitaa?:{name:string}|null}[] };
