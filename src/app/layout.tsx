import type { Metadata } from "next";
import { defaultLocale, getDictionary } from "@/i18n/dictionaries";
import "./globals.css";

const t = getDictionary();
export const metadata: Metadata = {
  title: { default: t.brand, template: `%s | ${t.brand}` },
  description: t.description,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={defaultLocale} className="antialiased">
      <body className="min-h-screen" suppressHydrationWarning>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:p-3 focus:text-primary-foreground">{t.skip}</a>
        {children}
      </body>
    </html>
  );
}
