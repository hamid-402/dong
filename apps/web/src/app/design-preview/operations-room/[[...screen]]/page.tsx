import { notFound } from "next/navigation";
import { OperationsRoomPreview } from "@/components/design-preview/operations-room-preview";

export default async function OperationsRoomPreviewPage({
  params,
}: {
  params: Promise<{ screen?: string[] }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { screen } = await params;
  return <OperationsRoomPreview initialScreen={screen?.[0]} />;
}
