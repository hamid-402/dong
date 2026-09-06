import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import "@dang/ui/tokens.css";
import "./globals.css";
import "./mosaic.css";
import { PwaRegister } from "../components/pwa-register";
import { ThemeProvider } from "../lib/theme";

const vazirmatn = Vazirmatn({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-vazirmatn",
});

export const metadata: Metadata = {
  title: "دنگ همکاری",
  description: "دفتر عملیات مشترک برای هزینه، خرید، تجهیزات و حساب شرکا",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    title: "دنگ همکاری",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7f6" },
    { media: "(prefers-color-scheme: dark)", color: "#090e0d" },
    { color: "#f4f7f6" },
  ],
};

const themeBootScript = `(function(){try{var t=localStorage.getItem("dang-theme");if(t!=="dark"&&t!=="light")t="light";document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className={vazirmatn.className}>
        <ThemeProvider>
          <a className="skip-link" href="#main-content">
            پرش به محتوای اصلی
          </a>
          <PwaRegister />
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
