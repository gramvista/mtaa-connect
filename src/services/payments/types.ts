export type PaymentRequest={id:string;residentId:string;phone:string;amount:3000;currency:'TZS';idempotencyKey:string};
export type VerifiedPayment={eventId:string;paymentId:string;providerReference:string;amount:3000;currency:'TZS'};
export type PaymentReconciliation=
 | {status:'pending'}
 | {status:'failed';reason:'insufficient_funds'|'rejected'}
 | {status:'successful';payment:VerifiedPayment};
export type PaymentInitiationErrorCode='method_unavailable'|'invalid_phone';
export class PaymentInitiationError extends Error {
 constructor(readonly code:PaymentInitiationErrorCode){super(code);this.name='PaymentInitiationError';}
}
export interface PaymentProvider {
 readonly name:string;
 initiate(request:PaymentRequest):Promise<{reference:string|null;checkoutUrl?:string;status:'pending'}>;
 verifyWebhook(rawBody:string,headers:Headers):Promise<VerifiedPayment|null>;
 reconcile?(paymentId:string):Promise<PaymentReconciliation>;
}
