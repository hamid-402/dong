"use client";

import { useEffect, useState } from "react";
import type { CategoryBudgetUsage, ProductFeatureFlags, ReimbursementSummary } from "@dang/contracts";
import { Button } from "@dang/ui";
import { api } from "@/lib/api";
import { newClientId } from "@/lib/id";
import { DataList, DataRow, EmptyHint, FormStack, SectionCard } from "@/components/ui-blocks";

export function WaveFFinancePanel({ workspaceId, flags, onError, onChanged }: {
  workspaceId: string; flags: ProductFeatureFlags;
  onError: (message: string | null) => void; onChanged: () => void;
}) {
  const [claims,setClaims]=useState<ReimbursementSummary[]>([]);
  const [budgets,setBudgets]=useState<CategoryBudgetUsage[]>([]);
  const [csv,setCsv]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{void Promise.all([
    flags.reimbursement?api.listReimbursements(workspaceId):Promise.resolve([]),
    flags.categoryBudget?api.listCategoryBudgetUsage(workspaceId):Promise.resolve([]),
  ]).then(([r,b])=>{setClaims(r);setBudgets(b);}).catch((e:unknown)=>onError(e instanceof Error?e.message:"خطا"));},[workspaceId,flags.reimbursement,flags.categoryBudget,onError]);
  async function importCsv(){
    setBusy(true);
    try{await api.importExpensesCsv(workspaceId,{csvText:csv,idempotencyKey:newClientId()});setCsv("");onChanged();}
    catch(e:unknown){onError(e instanceof Error?e.message:"ورود CSV ناموفق");}
    finally{setBusy(false);}
  }
  return <>
    {flags.reimbursement?<SectionCard title="درخواست‌های بازپرداخت" badge={claims.length}>
      {claims.length?<DataList>{claims.map(c=><DataRow key={c.id} title={c.title} meta={c.status} trailing={c.amount.amountMinor}/>)}</DataList>:<EmptyHint>درخواستی ثبت نشده است.</EmptyHint>}
    </SectionCard>:null}
    {flags.categoryBudget?<SectionCard title="مصرف بودجه دسته‌ها" badge={budgets.length}>
      {budgets.length?<DataList>{budgets.map(b=><DataRow key={b.id} title={`${b.yearMonth} · ${b.categoryId}`} meta={`${b.spent.amountMinor} / ${b.limit.amountMinor}`} trailing={b.alertReached?"هشدار":""}/>)}</DataList>:<EmptyHint>بودجه دسته‌ای ثبت نشده است.</EmptyHint>}
    </SectionCard>:null}
    {flags.expenseImport?<SectionCard title="ورود CSV هزینه">
      <FormStack>
        <label>CSV با ستون‌های title,amount_toman,occurred_on,visibility<textarea value={csv} onChange={e=>setCsv(e.target.value)} rows={5}/></label>
        <Button type="button" disabled={busy||!csv.trim()} onClick={()=>void importCsv()}>ایجاد پیش‌نویس‌ها</Button>
      </FormStack>
    </SectionCard>:null}
  </>;
}
