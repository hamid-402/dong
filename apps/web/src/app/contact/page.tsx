import type { Metadata } from "next";
import { siteMetadata } from "@/lib/site-meta";
import ContactClient from "./contact-client";

export const metadata: Metadata = siteMetadata({
  title: "تماس با ما",
  description: "ارتباط با پشتیبانی دنگ همکاری از طریق ایمیل.",
  path: "/contact",
});

export default function ContactPage() {
  return <ContactClient />;
}
