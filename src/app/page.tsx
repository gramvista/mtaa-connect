import { ArrowDown, MessageSquare, Radio, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDictionary } from "@/i18n/dictionaries";
import Link from 'next/link';
import { registrationText } from '@/i18n/registration';
import { adminText } from '@/i18n/admin';

export default function Home() {
  const t = getDictionary();
  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-5 sm:px-8">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><MessageSquare size={23} aria-hidden="true" /></span>
          <div><p className="text-lg font-bold tracking-tight">{t.brand}</p><p className="text-xs text-muted-foreground">{t.tagline}</p></div>
          <Link href="/login" className="ml-auto rounded-lg border px-3 py-2 text-sm font-medium">{adminText.loginLink}</Link>
        </div>
      </header>
      <main id="main-content">
        <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div>
            <p className="mb-5 text-xs font-bold tracking-[0.18em] text-primary">{t.eyebrow}</p>
            <h1 className="max-w-2xl text-4xl leading-tight font-bold tracking-tight sm:text-6xl">{t.title}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">{t.description}</p>
            <Button asChild className="mt-8 mr-3"><Link href="/register">{registrationText.title}</Link></Button>
            <Button asChild variant="outline" className="mt-3"><a href="#how-it-works">{t.learnMore}<ArrowDown size={16} aria-hidden="true" /></a></Button>
          </div>
          <Card className="border-primary/15 bg-primary/5 p-8 sm:p-10">
            <Radio className="mb-8 text-primary" size={36} aria-hidden="true" />
            <h2 className="text-2xl font-semibold tracking-tight">{t.status}</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">{t.statusDetail}</p>
          </Card>
        </section>
        <section id="how-it-works" className="border-y border-border bg-muted/50">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t.howTitle}</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">{t.howDescription}</p>
            <ol className="mt-8 grid gap-5 md:grid-cols-3">
              {t.steps.map((step, index) => (
                <li key={step.title}><Card className="h-full"><span className="mb-5 flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{index + 1}</span><h3 className="text-lg font-semibold">{step.title}</h3><p className="mt-3 leading-relaxed text-muted-foreground">{step.description}</p></Card></li>
              ))}
            </ol>
          </div>
        </section>
        <section className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-8 md:grid-cols-2">
          <div className="flex gap-4"><Smartphone className="shrink-0 text-primary" aria-hidden="true" /><div><h2 className="text-lg font-semibold">{t.accessTitle}</h2><p className="mt-2 leading-relaxed text-muted-foreground">{t.accessDescription}</p></div></div>
          <div className="flex gap-4"><ShieldCheck className="shrink-0 text-primary" aria-hidden="true" /><p className="leading-relaxed text-muted-foreground">{t.privacy}</p></div>
        </section>
      </main>
      <footer className="border-t border-border px-5 py-6 text-center text-sm text-muted-foreground">{t.brand} · {t.footer}</footer>
    </>
  );
}
