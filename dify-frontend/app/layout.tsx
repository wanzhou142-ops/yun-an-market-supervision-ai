import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "云安市场监管普法助手",
  description: "迎宾大厅数字人普法问答",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
