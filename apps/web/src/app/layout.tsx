import type { Metadata, Viewport } from "next";
import "@dang/ui/tokens.css";
import "./globals.css";
import { PwaRegister } from "../components/pwa-register";

export const metadata: Metadata = {
  title: "دنگ همکاری",
  description: "دفتر عملیات مشترک برای هزینه، خرید، تجهیزات و حساب شرکا",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "دنگ همکاری",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#090e0d",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <a className="skip-link" href="#main-content">
          پرش به محتوای اصلی
        </a>
        <PwaRegister />
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  );
}
