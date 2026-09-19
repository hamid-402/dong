-- Stage 11 / S11-06: catalog of goods/services (any item — not lunch-only).
-- Dual ownership: workspace catalog + personal menu (owner_kind).

CREATE SCHEMA IF NOT EXISTS "catalog";

CREATE TABLE IF NOT EXISTS "catalog"."unit" (
  "code" text PRIMARY KEY,
  "label_fa" text NOT NULL,
  "label_en" text NOT NULL,
  "kind" text NOT NULL,
  "base_code" text,
  "base_factor" numeric(18, 6),
  "is_system" boolean NOT NULL DEFAULT false,
  "workspace_id" uuid REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  CONSTRAINT "unit_kind_chk"
    CHECK ("kind" IN ('count', 'weight', 'volume', 'length', 'time', 'service')),
  CONSTRAINT "unit_system_or_workspace_chk"
    CHECK (
      ("is_system" = true AND "workspace_id" IS NULL)
      OR ("is_system" = false AND "workspace_id" IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS "unit_workspace_idx"
  ON "catalog"."unit" ("workspace_id");

INSERT INTO "catalog"."unit" ("code", "label_fa", "label_en", "kind", "base_code", "base_factor", "is_system")
VALUES
  ('piece', 'عدد', 'piece', 'count', NULL, NULL, true),
  ('pack', 'بسته', 'pack', 'count', NULL, NULL, true),
  ('kg', 'کیلوگرم', 'kilogram', 'weight', 'g', 1000, true),
  ('g', 'گرم', 'gram', 'weight', 'g', 1, true),
  ('l', 'لیتر', 'liter', 'volume', 'ml', 1000, true),
  ('ml', 'میلی‌لیتر', 'milliliter', 'volume', 'ml', 1, true),
  ('m', 'متر', 'meter', 'length', 'm', 1, true),
  ('hour', 'ساعت', 'hour', 'time', 'hour', 1, true),
  ('day', 'روز', 'day', 'time', 'hour', 24, true),
  ('service', 'خدمت', 'service', 'service', NULL, NULL, true)
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE IF NOT EXISTS "catalog"."catalog_category" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "parent_id" uuid REFERENCES "catalog"."catalog_category"("id") ON DELETE set null,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid REFERENCES "iam"."user_account"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "catalog_category_workspace_idx"
  ON "catalog"."catalog_category" ("workspace_id", "sort_order");

INSERT INTO "catalog"."catalog_category" ("id", "workspace_id", "parent_id", "name", "slug", "sort_order", "active")
VALUES
  ('a0000000-0000-4000-8000-000000000001', NULL, NULL, 'خوراک و نوشیدنی', 'food-drink', 10, true),
  ('a0000000-0000-4000-8000-000000000002', NULL, NULL, 'خدمات', 'services', 20, true),
  ('a0000000-0000-4000-8000-000000000003', NULL, NULL, 'متفرقه', 'misc', 30, true)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "catalog"."catalog_item" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_kind" text NOT NULL,
  "workspace_id" uuid REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "owner_user_id" uuid REFERENCES "iam"."user_account"("id") ON DELETE cascade,
  "category_id" uuid REFERENCES "catalog"."catalog_category"("id") ON DELETE set null,
  "name" text NOT NULL,
  "name_normalized" text NOT NULL,
  "unit_code" text NOT NULL REFERENCES "catalog"."unit"("code"),
  "reference_price_minor" bigint NOT NULL,
  "currency" text NOT NULL DEFAULT 'IRR',
  "description" text,
  "sku" text,
  "barcode" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "archived_at" timestamptz,
  CONSTRAINT "catalog_item_owner_kind_chk"
    CHECK ("owner_kind" IN ('workspace', 'user')),
  CONSTRAINT "catalog_item_owner_shape_chk"
    CHECK (
      ("owner_kind" = 'workspace' AND "workspace_id" IS NOT NULL AND "owner_user_id" IS NULL)
      OR ("owner_kind" = 'user' AND "owner_user_id" IS NOT NULL AND "workspace_id" IS NULL)
    ),
  CONSTRAINT "catalog_item_currency_chk" CHECK ("currency" = 'IRR')
);

CREATE UNIQUE INDEX IF NOT EXISTS "catalog_item_workspace_name_uq"
  ON "catalog"."catalog_item" ("workspace_id", "name_normalized")
  WHERE "owner_kind" = 'workspace' AND "archived_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "catalog_item_user_name_uq"
  ON "catalog"."catalog_item" ("owner_user_id", "name_normalized")
  WHERE "owner_kind" = 'user' AND "archived_at" IS NULL;

CREATE INDEX IF NOT EXISTS "catalog_item_workspace_active_idx"
  ON "catalog"."catalog_item" ("workspace_id", "active")
  WHERE "owner_kind" = 'workspace';

CREATE INDEX IF NOT EXISTS "catalog_item_user_active_idx"
  ON "catalog"."catalog_item" ("owner_user_id", "active")
  WHERE "owner_kind" = 'user';

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "catalog_item_name_trgm_idx"
  ON "catalog"."catalog_item" USING gin ("name_normalized" gin_trgm_ops);

CREATE TABLE IF NOT EXISTS "catalog"."catalog_item_price" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_id" uuid NOT NULL REFERENCES "catalog"."catalog_item"("id") ON DELETE cascade,
  "price_minor" bigint NOT NULL,
  "currency" text NOT NULL DEFAULT 'IRR',
  "effective_from" timestamptz DEFAULT now() NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id"),
  "note" text,
  CONSTRAINT "catalog_item_price_currency_chk" CHECK ("currency" = 'IRR')
);

CREATE INDEX IF NOT EXISTS "catalog_item_price_item_idx"
  ON "catalog"."catalog_item_price" ("item_id", "effective_from" DESC);

CREATE TABLE IF NOT EXISTS "catalog"."catalog_item_usage" (
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "item_id" uuid NOT NULL REFERENCES "catalog"."catalog_item"("id") ON DELETE cascade,
  "use_count" integer NOT NULL DEFAULT 0,
  "last_used_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("workspace_id", "item_id")
);

CREATE INDEX IF NOT EXISTS "catalog_item_usage_freq_idx"
  ON "catalog"."catalog_item_usage" ("workspace_id", "use_count" DESC, "last_used_at" DESC);

CREATE TABLE IF NOT EXISTS "catalog"."catalog_item_pin" (
  "workspace_id" uuid NOT NULL REFERENCES "iam"."workspace"("id") ON DELETE cascade,
  "item_id" uuid NOT NULL REFERENCES "catalog"."catalog_item"("id") ON DELETE cascade,
  "pinned_by_user_id" uuid NOT NULL REFERENCES "iam"."user_account"("id"),
  "pinned_at" timestamptz DEFAULT now() NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("workspace_id", "item_id")
);

CREATE INDEX IF NOT EXISTS "catalog_item_pin_sort_idx"
  ON "catalog"."catalog_item_pin" ("workspace_id", "sort_order");
