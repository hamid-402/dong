import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import "@dang/ui/tokens.css";
import "./globals.css";
import "./shell.css";
import { PwaRegister } from "../components/pwa-register";
import { ThemeProvider } from "../lib/theme";

const vazirmatn = Vazirmatn({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-vazirmatn",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3005"),
  title: {
    default: "دنگ همکاری",
    template: "%s · دنگ همکاری",
  },
  description: "دفتر عملیات مشترک برای هزینه، خرید، تجهیزات و حساب شرکا",
  applicationName: "دنگ همکاری",
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
  openGraph: {
    type: "website",
    locale: "fa_IR",
    siteName: "دنگ همکاری",
    title: "دنگ همکاری",
    description: "دفتر عملیات مشترک برای هزینه، خرید، تجهیزات و حساب شرکا",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9f8" },
    { media: "(prefers-color-scheme: dark)", color: "#090e0d" },
    { color: "#090e0d" },
  ],
};

const themeBootScript = `(function(){try{var t=localStorage.getItem("dang-theme");if(t!=="dark"&&t!=="light"&&t!=="dusk"&&t!=="mist"&&t!=="linear")t="dark";var a=localStorage.getItem("dang-atmosphere");if(a!=="deep"&&a!=="forest"&&a!=="sand"&&a!=="ember")a="deep";var d=localStorage.getItem("dang-density");if(d!=="comfortable"&&d!=="compact")d="comfortable";var m=localStorage.getItem("dang-motion");if(m!=="full"&&m!=="essential"&&m!=="off")m="full";if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches&&m!=="off")m="essential";document.documentElement.setAttribute("data-theme",t);document.documentElement.setAttribute("data-atmosphere",a);document.documentElement.setAttribute("data-density",d);document.documentElement.setAttribute("data-motion",m);}catch(e){document.documentElement.setAttribute("data-theme","dark");document.documentElement.setAttribute("data-atmosphere","deep");document.documentElement.setAttribute("data-density","comfortable");document.documentElement.setAttribute("data-motion","full");}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable} data-theme="dark" data-atmosphere="deep" data-density="comfortable" data-motion="full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className={vazirmatn.className} suppressHydrationWarning>
        <ThemeProvider>
          <a className="skip-link" href="#main">
            پرش به محتوا
          </a>
          <PwaRegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
