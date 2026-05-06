import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "麻雀AIトレーナー",
  description: "強い麻雀AIを目指すブラウザ麻雀練習アプリ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
