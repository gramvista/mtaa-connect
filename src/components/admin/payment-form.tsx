'use client';
import { useState } from 'react';
import { createPayment } from '@/features/payments/actions';
import { ActionForm } from '@/components/ui/form';
import { adminText as t } from '@/i18n/admin';
export function PaymentForm({residentId,idempotencyKey}:{residentId:string;idempotencyKey:string}){
 const [key]=useState(idempotencyKey);
 return <ActionForm action={createPayment} label={t.createPayment}><input type="hidden" name="resident_id" value={residentId}/><input type="hidden" name="key" value={key}/><p className="text-sm text-muted-foreground">{t.paymentPending}</p></ActionForm>;
}
