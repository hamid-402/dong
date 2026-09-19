import type { Metadata } from "next";
import { siteMetadata } from "@/lib/site-meta";
import ClientsClient from "./clients-client";

export const metadata: Metadata = siteMetadata({
  title: "مشتریان ما",
  description:
    "سناریوهای واقعی استفاده از دنگ همکاری برای گروه، تیم و مالی شخصی — بدون آمار نمایشی.",
  path: "/clients",
});

export default function ClientsPage() {
  return <ClientsClient />;
}
