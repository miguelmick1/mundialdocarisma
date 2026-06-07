import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Super Bolão Copa 2026",
  description: "Palpites, rankings, bots explicáveis e mata-mata de dupla eliminação."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
