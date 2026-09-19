"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  CatalogCategory,
  CatalogFrequentItem,
  CatalogItem,
  CatalogItemPrice,
  CatalogPin,
  CatalogUnit,
} from "@dang/contracts";
import { isFinanceManagerRole } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { AppShell } from "@/components/app-shell";
import {
  DataList,
  DataRow,
  EmptyHint,
  EmptyStateBlock,
  FormStack,
  SectionCard,
  StatusPill,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useFlashMessage, FlashMessages } from "@/lib/use-flash-message";
import { formatFaDate } from "@/lib/fa-datetime";
import { NAV_LABELS } from "@/lib/nav-labels";
import styles from "./catalog-view.module.css";

function flattenCategories(nodes: CatalogCategory[], depth = 0): Array<CatalogCategory & { depth: number }> {
  const out: Array<CatalogCategory & { depth: number }> = [];
  for (const node of nodes) {
    out.push({ ...node, depth });
    if (node.children?.length) out.push(...flattenCategories(node.children, depth + 1));
  }
  return out;
}

export function CatalogView() {
  const chrome = useAppChrome();
  const scope = useWorkspaceScope();
  const workspaceId = scope.workspaceId || chrome.workspaceId;
  const catalogProvider = chrome.capabilities?.providers?.catalog;
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [units, setUnits] = useState<CatalogUnit[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [frequent, setFrequent] = useState<CatalogFrequentItem[]>([]);
  const [pins, setPins] = useState<CatalogPin[]>([]);
  const [q, setQ] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [name, setName] = useState("");
  const [unitCode, setUnitCode] = useState("piece");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [myRole, setMyRole] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("piece");
  const [editPrice, setEditPrice] = useState("");
  const [historyItemId, setHistoryItemId] = useState<string | null>(null);
  const [prices, setPrices] = useState<CatalogItemPrice[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");

  const canManagePins = isFinanceManagerRole(myRole);
  const flatCats = flattenCategories(categories);

  function refresh(id: string, search = q, onlyActive = activeOnly) {
    startTransition(() => {
      void Promise.all([
        api.listCatalogItems(id, { q: search || undefined, activeOnly: onlyActive }),
        api.listUnits(id),
        api.listCatalogCategories(id).catch(() => [] as CatalogCategory[]),
        api.listCatalogFrequent(id, 10).catch(() => [] as CatalogFrequentItem[]),
        api.listCatalogPins(id).catch(() => [] as CatalogPin[]),
        api.listMembers(id).catch(() => []),
      ])
        .then(([page, unitRows, cats, freq, pinRows, members]) => {
          setItems(page.items);
          setUnits(unitRows);
          setCategories(cats);
          setFrequent(freq);
          setPins(pinRows);
          setMyRole(
            members.find((m) => m.userId === chrome.actor?.userId)?.role ?? "",
          );
          setError(null);
        })
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, "خواندن کاتالوگ ناموفق بود"));
        })
        .finally(() => setLoading(false));
    });
  }

  useEffect(() => {
    if (!chrome.ready) return;
    if (!workspaceId || catalogProvider !== "catalog_v1") {
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh(workspaceId);
  }, [chrome.ready, workspaceId, catalogProvider, chrome.actor?.userId]);

  function onSearch(next: string) {
    setQ(next);
    if (!workspaceId) return;
    refresh(workspaceId, next, activeOnly);
  }

  function onToggleActiveOnly(next: boolean) {
    setActiveOnly(next);
    if (!workspaceId) return;
    refresh(workspaceId, q, next);
  }

  function onCreate() {
    if (!workspaceId) return;
    const referencePriceMinor = price.replace(/[^\d]/g, "");
    if (!name.trim() || !unitCode || !referencePriceMinor) {
      setError("نام، واحد و قیمت الزامی است");
      return;
    }
    startTransition(() => {
      void api
        .createCatalogItem(workspaceId, {
          name: name.trim(),
          unitCode,
          referencePriceMinor,
          description: showMore && description.trim() ? description.trim() : undefined,
          sku: showMore && sku.trim() ? sku.trim() : undefined,
          barcode: showMore && barcode.trim() ? barcode.trim() : undefined,
          categoryId: categoryId || undefined,
        })
        .then(() => {
          setName("");
          setPrice("");
          setDescription("");
          setSku("");
          setBarcode("");
          setCategoryId("");
          setShowAdd(false);
          setShowMore(false);
          flashSuccess("قلم به کاتالوگ اضافه شد");
          refresh(workspaceId);
        })
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, "افزودن قلم ناموفق بود"));
        });
    });
  }

  function startEdit(item: CatalogItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditUnit(item.unitCode);
    setEditPrice(item.referencePriceMinor);
    setHistoryItemId(null);
  }

  function onSaveEdit() {
    if (!workspaceId || !editingId) return;
    const referencePriceMinor = editPrice.replace(/[^\d]/g, "");
    if (!editName.trim() || !editUnit || !referencePriceMinor) {
      setError("نام، واحد و قیمت الزامی است");
      return;
    }
    startTransition(() => {
      void api
        .updateCatalogItem(workspaceId, editingId, {
          name: editName.trim(),
          unitCode: editUnit,
          referencePriceMinor,
        })
        .then(() => {
          setEditingId(null);
          flashSuccess("قلم به‌روز شد؛ تغییر قیمت در تاریخچه ثبت می‌شود");
          refresh(workspaceId);
        })
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, "ویرایش قلم ناموفق بود"));
        });
    });
  }

  function onToggleHistory(itemId: string) {
    if (!workspaceId) return;
    if (historyItemId === itemId) {
      setHistoryItemId(null);
      setPrices([]);
      return;
    }
    startTransition(() => {
      void api
        .listCatalogPrices(workspaceId, itemId)
        .then((rows) => {
          setHistoryItemId(itemId);
          setPrices(rows);
          setError(null);
        })
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, "خواندن تاریخچه قیمت ناموفق بود"));
        });
    });
  }

  function onDeactivate(itemId: string) {
    if (!workspaceId) return;
    startTransition(() => {
      void api
        .deactivateCatalogItem(workspaceId, itemId)
        .then(() => {
          flashSuccess("قلم غیرفعال شد؛ در ثبت جدید نمی‌آید، سوابق دست‌نخورده می‌ماند");
          refresh(workspaceId);
        })
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, "غیرفعال‌سازی ناموفق بود"));
        });
    });
  }

  function onActivate(itemId: string) {
    if (!workspaceId) return;
    startTransition(() => {
      void api
        .activateCatalogItem(workspaceId, itemId)
        .then(() => {
          flashSuccess("قلم دوباره فعال شد");
          refresh(workspaceId);
        })
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, "فعال‌سازی ناموفق بود"));
        });
    });
  }

  function onImportPersonal() {
    if (!workspaceId) return;
    startTransition(() => {
      void api
        .importPersonalCatalog(workspaceId, {})
        .then((imported) => {
          flashSuccess(
            imported.length
              ? `${imported.length} قلم از منوی شخصی کپی شد`
              : "منوی شخصی خالی است یا همه نام‌ها از قبل در کاتالوگ بودند",
          );
          refresh(workspaceId);
        })
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, "ورود از منوی شخصی ناموفق بود"));
        });
    });
  }

  function onCreateCategory() {
    if (!workspaceId || !newCategoryName.trim()) return;
    startTransition(() => {
      void api
        .createCatalogCategory(workspaceId, { name: newCategoryName.trim() })
        .then(() => {
          setNewCategoryName("");
          flashSuccess("دسته اضافه شد");
          refresh(workspaceId);
        })
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, "افزودن دسته ناموفق بود"));
        });
    });
  }

  function onReplacePins(itemIds: string[]) {
    if (!workspaceId) return;
    startTransition(() => {
      void api
        .replaceCatalogPins(workspaceId, { itemIds })
        .then(() => {
          flashSuccess("فهرست پین مادرخرج به‌روز شد");
          refresh(workspaceId);
        })
        .catch((reason: unknown) => {
          setError(friendlyErrorMessage(reason, "ذخیره پین‌ها ناموفق بود"));
        });
    });
  }

  function togglePin(itemId: string) {
    const current = pins.map((p) => p.itemId);
    const next = current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId];
    onReplacePins(next);
  }

  const pageError = error ?? chrome.error;
  const unitLabel = (code: string) =>
    units.find((u) => u.code === code)?.labelFa ?? code;
  const pinnedIds = new Set(pins.map((p) => p.itemId));

  if (catalogProvider !== "catalog_v1") {
    return (
      <AppShell
        workspaceId={chrome.workspaceId}
        workspaceName={chrome.workspaceName || undefined}
        userName={chrome.userName || undefined}
        persistenceLabel={chrome.persistenceLabel}
      >
        <EmptyHint>
          کاتالوگ وقتی در capabilities با providers.catalog برابر catalog_v1 باشد در دسترس است.
        </EmptyHint>
      </AppShell>
    );
  }

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
      title={NAV_LABELS.catalog}
      description={"اقلام گروه با واحد و قیمت مرجع واقعی."}
      primaryAction={<a href="#catalog-items">افزودن قلم</a>}
      state="ready"
    >

      <FlashMessages successMessage={successMessage} error={pageError} />

      <SectionCard
        title="پرکاربردها"
        description="فقط از شمارش واقعی مصرف در همین فضا — بدون فهرست جعلی."
      >
        {loading ? (
          <ContentSkeleton rows={2} label="در حال خواندن مصرف…" />
        ) : frequent.length === 0 ? (
          <EmptyStateBlock
            title="هنوز مصرفی ثبت نشده"
            description="بعد از انتخاب قلم در ثبت خرج یا دفتر روزانه، اینجا از شمارش واقعی پر می‌شود."
            sticker="folder"
          />
        ) : (
          <DataList>
            {frequent.map((item) => (
              <DataRow
                key={item.id}
                title={item.name}
                meta={`${unitLabel(item.unitCode)} · ${item.useCount} بار`}
                trailing={<Amount irrMinor={item.referencePriceMinor} />}
              />
            ))}
          </DataList>
        )}
      </SectionCard>

      <SectionCard
        id="catalog-items"
        title="کاتالوگ کالا و خدمت"
        description="هر کالا، خدمت، وعده یا تنقلات — نام، واحد و قیمت مرجع برای ثبت سریع."
        actions={
          <div className={styles.toolbarActions}>
            <Button type="button" variant="secondary" onClick={onImportPersonal} disabled={pending}>
              ورود از منوی شخصی
            </Button>
            <Button type="button" onClick={() => setShowAdd((v) => !v)} disabled={pending}>
              {showAdd ? "بستن فرم" : "افزودن قلم"}
            </Button>
          </div>
        }
      >
        <div className={styles.toolbar}>
          <TextField
            label="جست‌وجو"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="نام قلم…"
          />
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => onToggleActiveOnly(e.target.checked)}
            />
            فقط فعال‌ها
          </label>
        </div>

        {showAdd ? (
          <FormStack className={styles.addForm}>
            <TextField
              label="نام"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <SelectField
              label="واحد"
              value={unitCode}
              onChange={(e) => setUnitCode(e.target.value)}
            >
              {units.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.labelFa}
                </option>
              ))}
            </SelectField>
            <TextField
              label="قیمت مرجع (ریال)"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
              required
            />
            {flatCats.length > 0 ? (
              <SelectField
                label="دسته"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">بدون دسته</option>
                {flatCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"—".repeat(c.depth)} {c.name}
                  </option>
                ))}
              </SelectField>
            ) : null}
            <button
              type="button"
              className={styles.disclose}
              onClick={() => setShowMore((v) => !v)}
            >
              {showMore ? "پنهان کردن مشخصات بیشتر" : "مشخصات بیشتر"}
            </button>
            {showMore ? (
              <>
                <TextField
                  label="توضیح"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <TextField
                  label="SKU"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                />
                <TextField
                  label="بارکد"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                />
              </>
            ) : null}
            <Button type="button" onClick={onCreate} disabled={pending}>
              ثبت قلم
            </Button>
          </FormStack>
        ) : null}

        {loading ? (
          <ContentSkeleton rows={4} label="در حال بارگذاری کاتالوگ…" />
        ) : items.length === 0 ? (
          <EmptyStateBlock
            title="هنوز قلمی ثبت نشده"
            description="اولین کالا یا خدمت را اضافه کنید تا ثبت روزانه سریع شود."
            sticker="spark"
            action={
              <Button type="button" onClick={() => setShowAdd(true)}>
                افزودن قلم
              </Button>
            }
          />
        ) : (
          <DataList>
            {items.map((item) => (
              <div key={item.id} className={styles.itemBlock}>
                {editingId === item.id ? (
                  <FormStack className={styles.addForm}>
                    <TextField
                      label="نام"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <SelectField
                      label="واحد"
                      value={editUnit}
                      onChange={(e) => setEditUnit(e.target.value)}
                    >
                      {units.map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.labelFa}
                        </option>
                      ))}
                    </SelectField>
                    <TextField
                      label="قیمت مرجع (ریال)"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      inputMode="numeric"
                    />
                    <div className={styles.rowActions}>
                      <Button type="button" onClick={onSaveEdit} disabled={pending}>
                        ذخیره
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setEditingId(null)}
                        disabled={pending}
                      >
                        انصراف
                      </Button>
                    </div>
                  </FormStack>
                ) : (
                  <DataRow
                    title={item.name}
                    meta={`${unitLabel(item.unitCode)} · ${item.active ? "فعال" : "غیرفعال"}`}
                    trailing={
                      <div className={styles.rowActions}>
                        <Amount irrMinor={item.referencePriceMinor} />
                        <StatusPill tone={item.active ? "ok" : "neutral"}>
                          {item.active ? "فعال" : "غیرفعال"}
                        </StatusPill>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => startEdit(item)}
                          disabled={pending}
                        >
                          ویرایش
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => onToggleHistory(item.id)}
                          disabled={pending}
                        >
                          {historyItemId === item.id ? "بستن تاریخچه" : "تاریخچه قیمت"}
                        </Button>
                        {canManagePins ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => togglePin(item.id)}
                            disabled={pending || !item.active}
                          >
                            {pinnedIds.has(item.id) ? "برداشتن پین" : "پین مادرخرج"}
                          </Button>
                        ) : null}
                        {item.active ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => onDeactivate(item.id)}
                            disabled={pending}
                          >
                            غیرفعال
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => onActivate(item.id)}
                            disabled={pending}
                          >
                            فعال‌سازی
                          </Button>
                        )}
                      </div>
                    }
                  />
                )}
                {historyItemId === item.id ? (
                  prices.length === 0 ? (
                    <EmptyHint>تاریخچه‌ای ثبت نشده.</EmptyHint>
                  ) : (
                    <ul className={styles.priceList}>
                      {prices.map((p) => (
                        <li key={p.id}>
                          <Amount irrMinor={p.priceMinor} />
                          <span className={styles.priceMeta}>
                            {formatFaDate(p.effectiveFrom)}
                            {p.note ? ` · ${p.note}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </div>
            ))}
          </DataList>
        )}

        {!loading && items.length === 0 && q.trim() ? (
          <EmptyHint>
            نتیجه‌ای نیست. می‌توانید قلمی با نام «{q.trim()}» اضافه کنید.
          </EmptyHint>
        ) : null}
      </SectionCard>

      <SectionCard
        title="دسته‌ها"
        description="درخت دستهٔ سیستمی و فضای کاری — حداکثر دو سطح."
      >
        {flatCats.length === 0 ? (
          <EmptyHint>هنوز دسته‌ای نیست.</EmptyHint>
        ) : (
          <DataList>
            {flatCats.map((c) => (
              <DataRow
                key={c.id}
                title={`${"　".repeat(c.depth)}${c.name}`}
                meta={c.active ? c.slug : `${c.slug} · غیرفعال`}
              />
            ))}
          </DataList>
        )}
        {canManagePins ? (
          <FormStack className={styles.addForm}>
            <TextField
              label="دسته جدید"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <Button type="button" onClick={onCreateCategory} disabled={pending}>
              افزودن دسته
            </Button>
          </FormStack>
        ) : null}
      </SectionCard>

      {canManagePins ? (
        <SectionCard
          title="پین‌های مادرخرج"
          description="فهرست دستی برای دسترسی سریع — فقط نقش‌های مالی."
        >
          {pins.length === 0 ? (
            <EmptyHint>پینی تنظیم نشده. از دکمهٔ «پین مادرخرج» روی اقلام استفاده کنید.</EmptyHint>
          ) : (
            <DataList>
              {pins.map((pin) => (
                <DataRow
                  key={pin.itemId}
                  title={pin.item?.name ?? pin.itemId}
                  meta={`ترتیب ${pin.sortOrder + 1}`}
                  trailing={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => togglePin(pin.itemId)}
                      disabled={pending}
                    >
                      برداشتن
                    </Button>
                  }
                />
              ))}
            </DataList>
          )}
        </SectionCard>
      ) : null}
    
      </WorkspacePageFrame></AppShell>
  );
}
