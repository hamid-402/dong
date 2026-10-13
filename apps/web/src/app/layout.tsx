import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import "@dang/ui/tokens.css";
import "./globals.css";
import "./shell.css";
import "./phase3.css";
import "./phase4.css";
import "./phase5.css";
import { PwaRegister } from "../components/pwa-register";
import { ThemeProvider } from "../lib/theme";
import { ConfirmProvider } from "@dang/ui";

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
    { media: "(prefers-color-scheme: light)", color: "#F7F4EE" },
    { media: "(prefers-color-scheme: dark)", color: "#121826" },
    { color: "#F7F4EE" },
  ],
};

/** Keep in lockstep with migrateStoredTheme() in lib/theme.tsx. */
const themeBootScript = `(function(){try{var t=localStorage.getItem("dang-theme");var next=t;if(t==="light")next="paper";else if(t==="dark")next="midnight";else if(t!=="white"&&t!=="black"&&t!=="paper"&&t!=="midnight")next="paper";if(t&&t!==next)localStorage.setItem("dang-theme",next);t=next;try{localStorage.removeItem("dang-atmosphere");}catch(e){}var scheme=(t==="black"||t==="midnight")?"dark":"light";var d=localStorage.getItem("dang-density");if(d!=="comfortable"&&d!=="compact")d="comfortable";var m=localStorage.getItem("dang-motion");if(m!=="full"&&m!=="essential"&&m!=="off")m="off";if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches&&m!=="off")m="essential";var root=document.documentElement;root.setAttribute("data-theme",t);root.setAttribute("data-scheme",scheme);root.removeAttribute("data-atmosphere");root.setAttribute("data-density",d);root.setAttribute("data-motion",m);}catch(e){document.documentElement.setAttribute("data-theme","paper");document.documentElement.setAttribute("data-scheme","light");document.documentElement.removeAttribute("data-atmosphere");document.documentElement.setAttribute("data-density","comfortable");document.documentElement.setAttribute("data-motion","off");}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable} data-theme="paper" data-scheme="light" data-density="comfortable" data-motion="off" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className={vazirmatn.className} suppressHydrationWarning>
        <ThemeProvider>
          <ConfirmProvider>
            <a className="skip-link" href="#main">
              پرش به محتوا
            </a>
            <PwaRegister />
            {children}
          </ConfirmProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
