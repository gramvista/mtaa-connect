import { redirect } from "next/navigation";
import { resetPassword } from "@/features/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ui/form";
import { PasswordPair } from "@/components/ui/password-input";
import { Card } from "@/components/ui/card";
import { adminText as t } from "@/i18n/admin";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login?error=reset");
  return <main id="main-content" className="mx-auto max-w-md px-5 py-16"><p className="mb-6 font-bold text-primary">{t.brand}</p><Card>
    <h1 className="text-2xl font-bold">{t.resetPasswordTitle}</h1><p className="mt-3 mb-6 text-muted-foreground">{t.resetPasswordHelp}</p>
    <ActionForm action={resetPassword} label={t.saveNewPassword}>
      <PasswordPair/>
    </ActionForm>
  </Card></main>;
}
