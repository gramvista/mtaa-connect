import Link from "next/link";
import { requestPasswordReset } from "@/features/auth/actions";
import { ActionForm, inputClass } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { adminText as t } from "@/i18n/admin";

export default function ForgotPasswordPage() {
  return <main id="main-content" className="mx-auto max-w-md px-5 py-16"><p className="mb-6 font-bold text-primary">{t.brand}</p><Card>
    <h1 className="text-2xl font-bold">{t.forgotPasswordTitle}</h1><p className="mt-3 mb-6 text-muted-foreground">{t.forgotPasswordHelp}</p>
    <ActionForm action={requestPasswordReset} label={t.sendResetLink}>
      <label className="block text-sm">{t.email}<input className={inputClass} type="email" name="email" autoComplete="email" required maxLength={254}/></label>
    </ActionForm>
    <Link href="/login" className="mt-6 inline-block text-sm underline">{t.backToLogin}</Link>
  </Card></main>;
}
