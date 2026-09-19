import type { Metadata } from "next";
import { siteMetadata } from "@/lib/site-meta";
import AboutClient from "./about-client";

export const metadata: Metadata = siteMetadata({
  title: "درباره ما",
  description:
    "دنگ همکاری؛ دفتر عملیات مشترک با جداسازی سایت معرفی از فضای کاری.",
  path: "/about",
});

export default function AboutPage() {
  return <AboutClient />;
}
