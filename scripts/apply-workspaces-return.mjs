import fs from "fs";

const pagePath = "apps/web/src/app/workspaces/page.tsx";
const fragmentPath = "scripts/workspaces-return.fragment.tsx";

let s = fs.readFileSync(pagePath, "utf8");
const fragment = fs.readFileSync(fragmentPath, "utf8");

if (!s.includes('from "@/components/app-shell"')) {
  s = s.replace(
    'import { Amount, Button, SelectField, Surface, TextField } from "@dang/ui";\nimport { api, getDevIdentity, setDevIdentity, type AuditEventDto } from "@/lib/api";',
    `import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  PageHeader,
  ProductGrid,
  SectionCard,
  StatusPill,
} from "@/components/ui-blocks";
import { api, getDevIdentity, setDevIdentity, type AuditEventDto } from "@/lib/api";`,
  );
}

const marker = "  return (\r\n    <main className=\"page\" dir=\"rtl\">";
const idx = s.lastIndexOf(marker);
if (idx < 0) {
  const alt = s.lastIndexOf('<main className="page" dir="rtl">');
  if (alt < 0) throw new Error("Could not find legacy return marker");
  const ret = s.lastIndexOf("return (", alt);
  fs.writeFileSync(pagePath, s.slice(0, ret) + fragment.replace(/\n/g, "\r\n"), "utf8");
  console.log("workspaces page unified (alt)");
} else {
  fs.writeFileSync(pagePath, s.slice(0, idx) + fragment.replace(/\n/g, "\r\n"), "utf8");
  console.log("workspaces page unified");
}
