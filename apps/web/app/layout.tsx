import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/common/providers";
import { Toaster } from "@/components/ui/sonner";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";

// Paperlogy — 한글 중심 geometric sans. Apple 가이드의 SF Pro 자리.
// 웨이트 4개(400/500/600/700) 만 — 디자인 원칙(300~700 활용) + 로드 용량 최소화.
const paperlogy = localFont({
  src: [
    { path: "../public/fonts/paperlogy/Paperlogy-4Regular.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/paperlogy/Paperlogy-5Medium.ttf", weight: "500", style: "normal" },
    { path: "../public/fonts/paperlogy/Paperlogy-6SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../public/fonts/paperlogy/Paperlogy-7Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: [
    "-apple-system",
    "BlinkMacSystemFont",
    "Pretendard Variable",
    "Pretendard",
    "Apple SD Gothic Neo",
    "Segoe UI",
    "Roboto",
    "sans-serif",
  ],
});

export const metadata: Metadata = {
  title: "마케팅 인텔리전스 - AI 매장 마케팅 매니저",
  description: "자영업자를 위한 AI 기반 자동 마케팅 매니저",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={cn("font-sans", paperlogy.variable)}>
      <body>
        <Providers>{children}</Providers>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
