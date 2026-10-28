-- Run 17 / phase 0: FORCE ROW LEVEL SECURITY on tables that already ENABLE RLS
-- (G03 tags, G04 guest/presets, G10 agreed_price) but were missing FORCE.
--> statement-breakpoint
ALTER TABLE "finance"."expense_tag" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."expense_tag_link" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."workspace_split_preset" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "finance"."workspace_split_preset_line" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "iam"."guest_placeholder" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "partnership"."agreed_price" FORCE ROW LEVEL SECURITY;
