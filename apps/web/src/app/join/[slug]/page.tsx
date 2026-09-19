"use client";

import { useParams } from "next/navigation";
import { JoinGroupView } from "@/components/views/join-group-view";

export default function JoinBySlugPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  return <JoinGroupView initialSlug={slug} />;
}
