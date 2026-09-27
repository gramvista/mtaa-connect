import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/i18n/dictionaries";
export default function NotFound() {
  const t = getDictionary();
  return <main id="main-content" className="mx-auto max-w-xl space-y-5 px-5 py-20"><h1 className="text-2xl font-bold">{t.notFound}</h1><p className="text-muted-foreground">{t.notFoundDescription}</p><Button asChild><Link href="/">{t.home}</Link></Button></main>;
}
