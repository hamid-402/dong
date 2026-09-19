import type { Metadata } from "next";

const SITE_NAME = "دنگ همکاری";
const SITE_DESC =
  "دنگ همکاری؛ دفتر عملیات مشترک برای هزینه، خرید، تجهیزات و حساب شرکا — شفاف، قابل پیگیری، بدون آمار نمایشی.";

export function siteMetadata(page: {
  title: string;
  description?: string;
  path?: string;
}): Metadata {
  const title =
    page.title === SITE_NAME ? SITE_NAME : `${page.title} · ${SITE_NAME}`;
  const description = page.description ?? SITE_DESC;
  const path = page.path ?? "/";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      locale: "fa_IR",
      type: "website",
      siteName: SITE_NAME,
      url: path,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    alternates: {
      canonical: path,
    },
  };
}

export const ROOT_SITE_METADATA = siteMetadata({
  title: SITE_NAME,
  description: SITE_DESC,
  path: "/",
});
