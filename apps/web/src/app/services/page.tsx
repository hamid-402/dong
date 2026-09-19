import type { Metadata } from "next";
import { siteMetadata } from "@/lib/site-meta";
import ServicesClient from "./services-client";

export const metadata: Metadata = siteMetadata({
  title: "خدمات ما",
  description:
    "هزینه و تسویه، خرید و تجهیزات، حساب شرکا و گزارش دوره‌ای — مسیرهای واقعی داخل فضای کاری.",
  path: "/services",
});

export default function ServicesPage() {
  return <ServicesClient />;
}
