"use client";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/i18n/dictionaries";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = getDictionary();
  return <main id="main-content" className="mx-auto max-w-xl space-y-5 px-5 py-20"><h1 className="text-2xl font-bold">{t.errorTitle}</h1><p className="text-muted-foreground">{t.errorDescription}</p><Button onClick={reset}>{t.retry}</Button></main>;
}
