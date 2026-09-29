'use client';

import { forwardRef,useRef,useState,type ComponentPropsWithoutRef } from 'react';
import { Eye,EyeOff } from 'lucide-react';
import { adminText as t } from '@/i18n/admin';
import { cn } from '@/lib/utils';
import { inputClass } from './form';

type PasswordInputProps=Omit<ComponentPropsWithoutRef<'input'>,'type'>&{label:string};

export const PasswordInput=forwardRef<HTMLInputElement,PasswordInputProps>(function PasswordInput({label,className,...props},ref){
 const [visible,setVisible]=useState(false);
 return <label className="block text-sm">{label}<span className="relative mt-1 block">
  <input {...props} ref={ref} type={visible?'text':'password'} className={cn(inputClass,'mt-0 pr-12',className)}/>
  <button type="button" onClick={()=>setVisible(value=>!value)} aria-label={visible?t.hidePassword:t.showPassword} aria-pressed={visible} title={visible?t.hidePassword:t.showPassword} className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
   {visible?<EyeOff aria-hidden="true" className="size-5"/>:<Eye aria-hidden="true" className="size-5"/>}
  </button>
 </span></label>;
});

export function PasswordPair({passwordLabel=t.newPassword,confirmationLabel=t.confirmPassword}:{passwordLabel?:string;confirmationLabel?:string}){
 const [password,setPassword]=useState('');
 const confirmationRef=useRef<HTMLInputElement>(null);
 const validate=(passwordValue:string,confirmationValue:string)=>confirmationRef.current?.setCustomValidity(confirmationValue&&passwordValue!==confirmationValue?t.passwordMismatch:'');
 return <>
  <PasswordInput label={passwordLabel} name="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={event=>{const value=event.currentTarget.value;setPassword(value);validate(value,confirmationRef.current?.value||'');}}/>
  <PasswordInput label={confirmationLabel} name="confirmation" autoComplete="new-password" required minLength={8} maxLength={128} ref={confirmationRef} onChange={event=>validate(password,event.currentTarget.value)}/>
 </>;
}
