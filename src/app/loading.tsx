import { getDictionary } from "@/i18n/dictionaries";
export default function Loading() {
  return <main id="main-content" className="mx-auto max-w-6xl p-8"><p role="status" className="text-muted-foreground">{getDictionary().loading}</p></main>;
}
