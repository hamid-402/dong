import { redirect } from "next/navigation";

/** Alias for `/admin` (IA-UX /admin · API /platform). */
export default function PlatformAliasPage() {
  redirect("/admin");
}
