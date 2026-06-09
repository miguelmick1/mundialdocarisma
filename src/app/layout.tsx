import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mundial Snickers do Carisma 2026",
  description: "Grupos, confrontos, sorteios ao vivo, Times Carisma e bots explicáveis."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
