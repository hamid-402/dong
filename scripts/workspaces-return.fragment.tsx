  return (
    <AppShell
      workspaceName={workspaces.find((w) => w.id === selectedId)?.name}
      userName={session?.actor?.displayName ?? devDisplayName}
      persistenceLabel="مالی و تسویه"
    >
      <PageHeader
        eyebrow="ماژول مالی"
        title="هزینه، مانده و تسویه"
        description="ثبت خرج، دفترکل، تسویه و لینک پرداخت — همان زبان بصری خانهٔ سامانه."
        actions={
          <>
            <Link href="/workspaces/invite">دعوت عضو</Link>
            <button type="button" disabled={pending} onClick={refresh}>
              تازه‌سازی
            </button>
          </>
        }
      />
      {error ? <p className="liveError">{error}</p> : null}
      <ProductGrid>
        <SectionCard title="هویت Dev" delayClass="delay1">
          <p className="emptyHint" style={{ border: "none", padding: 0 }}>
            تا OIDC، هویت از localStorage می‌آید.
            {session?.actor ? (
              <>
                {" "}
                الان: {session.actor.displayName} ({session.mode})
              </>
            ) : null}
          </p>
          <FormStack>
            <TextField
              label="Subject"
              value={devSubject}
              onChange={(event) => setDevSubject(event.target.value)}
            />
            <TextField
              label="نام نمایشی"
              value={devDisplayName}
              onChange={(event) => setDevDisplayName(event.target.value)}
            />
            <Button type="button" onClick={refresh} disabled={pending}>
              اعمال هویت و تازه‌سازی
            </Button>
          </FormStack>
        </SectionCard>

        <SectionCard title="فضاهای کاری" badge={workspaces.length} delayClass="delay1">
          {workspaces.length === 0 ? (
            <EmptyHint>
              هنوز فضایی ندارید. از <Link href="/onboarding">ساخت فضای کاری</Link> شروع کنید.
            </EmptyHint>
          ) : (
            <div className="workspaceChipRow">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  className={workspace.id === selectedId ? "workspaceChip active" : "workspaceChip"}
                  onClick={() => {
                    setSelectedId(workspace.id);
                    startTransition(() => {
                      void loadWorkspaceData(workspace.id)
                        .then(applyWorkspaceData)
                        .catch((err: unknown) => {
                          setError(err instanceof Error ? err.message : "خطای ناشناخته");
                        });
                    });
                  }}
                >
                  {workspace.name} · {workspace.template}
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        {selectedId ? (
          <>
            <SectionCard title="مانده از Journal" delayClass="delay2">
              <p className="emptyHint" style={{ border: "none", padding: 0 }}>
                Projection از دفترکل.
                {balances ? ` · zero-sum: ${balances.zeroSum ? "بله" : "خیر"}` : null}
              </p>
              <DataList>
                {!balances || balances.lines.length === 0 ? (
                  <EmptyHint>ماندهٔ باز نیست.</EmptyHint>
                ) : (
                  balances.lines.map((line) => (
                    <DataRow
                      key={line.userId}
                      title={memberLabel(line.userId)}
                      meta={balancePhrase(line.net.amountMinor)}
                      trailing={
                        <Amount
                          irrMinor={
                            line.net.amountMinor.startsWith("-")
                              ? line.net.amountMinor.slice(1)
                              : line.net.amountMinor
                          }
                        />
                      }
                    />
                  ))
                )}
              </DataList>
            </SectionCard>

            <SectionCard title="پیش‌نویس هزینه + تقسیم مساوی" delayClass="delay2">
              <FormStack>
                <TextField label="عنوان" value={title} onChange={(event) => setTitle(event.target.value)} />
                <TextField
                  label="مبلغ (تومان)"
                  value={amountToman}
                  onChange={(event) => setAmountToman(event.target.value)}
                />
                <SelectField
                  label="روش تقسیم"
                  value={splitMethod}
                  onChange={(event) => setSplitMethod(event.target.value as SplitMethod)}
                >
                  <option value="equal">مساوی</option>
                  <option value="amount">مبلغی (API)</option>
                  <option value="percent">درصدی (API)</option>
                  <option value="shares">سهمی (API)</option>
                </SelectField>
                <fieldset style={{ margin: 0, border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
                  <legend style={{ paddingInline: 6, color: "var(--muted)" }}>شرکت‌کنندگان</legend>
                  {members.length === 0 ? (
                    <EmptyHint>عضوی نیست.</EmptyHint>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {members.map((member) => (
                        <label key={member.userId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={participantIds.includes(member.userId)}
                            onChange={() => toggleParticipant(member.userId)}
                          />
                          <span>
                            {member.displayName} · {member.role}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
                {previewSplits.length > 0 ? (
                  <DataList>
                    {previewSplits.map((line) => (
                      <DataRow
                        key={line.userId}
                        title={memberLabel(line.userId)}
                        trailing={<Amount irrMinor={line.amount.amountMinor} />}
                      />
                    ))}
                  </DataList>
                ) : null}
                <div className="dataRowActions">
                  <Button type="button" onClick={onCreateExpense} disabled={pending}>
                    ثبت پیش‌نویس
                  </Button>
                  <Button type="button" variant="ghost" onClick={onSaveOfflineDraft} disabled={pending}>
                    ذخیره آفلاین
                  </Button>
                </div>
              </FormStack>
              {offlineDrafts.length > 0 ? (
                <DataList>
                  {offlineDrafts.map((draft) => (
                    <DataRow
                      key={draft.id}
                      title={draft.title}
                      meta={`${draft.totalToman} تومان`}
                      actions={
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onSyncOfflineDraft(draft)}
                            disabled={pending}
                          >
                            همگام‌سازی
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              removeOfflineExpenseDraft(draft.id);
                              setOfflineDrafts(listOfflineExpenseDrafts(selectedId));
                            }}
                          >
                            حذف
                          </Button>
                        </>
                      }
                    />
                  ))}
                </DataList>
              ) : null}
              <DataList>
                {expenses.length === 0 ? <EmptyHint>هزینه‌ای ثبت نشده.</EmptyHint> : null}
                {expenses.map((expense) => (
                  <DataRow
                    key={expense.id}
                    title={expense.title}
                    meta={
                      <StatusPill tone={expense.status === "posted" ? "ok" : "warn"}>{expense.status}</StatusPill>
                    }
                    trailing={<Amount irrMinor={expense.total.amountMinor} />}
                    actions={
                      <>
                        {expense.status === "draft" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onSubmitExpense(expense.id)}
                            disabled={pending}
                          >
                            ارسال
                          </Button>
                        ) : null}
                        {expense.status === "draft" || expense.status === "submitted" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onPostExpense(expense.id)}
                            disabled={pending}
                          >
                            ثبت در دفترکل
                          </Button>
                        ) : null}
                      </>
                    }
                  />
                ))}
              </DataList>
            </SectionCard>

            <SectionCard title="ادعای تسویه + لینک پرداخت" delayClass="delay3">
              <FormStack>
                <SelectField
                  label="طرف مقابل"
                  value={settleToUserId}
                  onChange={(event) => setSettleToUserId(event.target.value)}
                >
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName} · {member.role}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="مبلغ تسویه (تومان)"
                  value={settleAmountToman}
                  onChange={(event) => setSettleAmountToman(event.target.value)}
                />
                <Button type="button" onClick={onCreateSettlement} disabled={pending || members.length < 2}>
                  ثبت ادعا
                </Button>
              </FormStack>
              {members.length < 2 ? (
                <EmptyHint>
                  برای تسویه حداقل دو عضو لازم است — از <Link href="/workspaces/invite">دعوت</Link>{" "}
                  استفاده کنید.
                </EmptyHint>
              ) : null}
              <DataList>
                {settlements.map((settlement) => (
                  <DataRow
                    key={settlement.id}
                    title={`${memberLabel(settlement.fromUserId)} → ${memberLabel(settlement.toUserId)}`}
                    meta={
                      <StatusPill tone={settlement.status === "confirmed" ? "ok" : "gold"}>
                        {settlement.status}
                      </StatusPill>
                    }
                    trailing={<Amount irrMinor={settlement.amount.amountMinor} />}
                    actions={
                      settlement.status === "claimed" ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onConfirmSettlement(settlement.id)}
                            disabled={pending}
                          >
                            تأیید
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onDisputeSettlement(settlement.id)}
                            disabled={pending}
                          >
                            اعتراض
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onCancelSettlement(settlement.id)}
                            disabled={pending}
                          >
                            لغو
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onCreatePaymentLink(settlement)}
                            disabled={pending}
                          >
                            لینک پرداخت
                          </Button>
                        </>
                      ) : settlement.status === "disputed" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => onCancelSettlement(settlement.id)}
                          disabled={pending}
                        >
                          لغو
                        </Button>
                      ) : null
                    }
                  />
                ))}
              </DataList>
              {paymentLinks.length > 0 ? (
                <DataList>
                  {paymentLinks.map((link) => (
                    <DataRow
                      key={link.id}
                      title={`پرداخت ${link.status}`}
                      meta={
                        <a href={link.checkoutUrl} target="_blank" rel="noreferrer">
                          باز کردن checkout
                        </a>
                      }
                      trailing={<Amount irrMinor={link.amount.amountMinor} />}
                    />
                  ))}
                </DataList>
              ) : null}
            </SectionCard>

            <div className="productGrid cols-2">
              <SectionCard title="دفترکل" badge={ledgerEntries.length} delayClass="delay4">
                <DataList>
                  {ledgerEntries.length === 0 ? (
                    <EmptyHint>هنوز ورودی journal نیست — هزینه را Post کنید.</EmptyHint>
                  ) : null}
                  {ledgerEntries.map((entry) => (
                    <DataRow
                      key={entry.id}
                      title={`${entry.sourceType}:${entry.sourceId.slice(0, 8)}`}
                      meta={entry.lines
                        .map((line) => `${line.side} ${memberLabel(line.userId)}`)
                        .join(" · ")}
                      trailing={`${entry.lines.length} خط`}
                    />
                  ))}
                </DataList>
              </SectionCard>
              <SectionCard title="رویدادهای Audit" badge={auditEvents.length} delayClass="delay4">
                <DataList>
                  {auditEvents.length === 0 ? <EmptyHint>رویدادی نیست.</EmptyHint> : null}
                  {auditEvents.slice(0, 12).map((event) => (
                    <DataRow
                      key={event.id}
                      title={event.action}
                      meta={`${event.targetType} · ${event.result}`}
                      trailing={
                        <StatusPill tone={event.result === "success" ? "ok" : "warn"}>
                          {event.result}
                        </StatusPill>
                      }
                    />
                  ))}
                </DataList>
              </SectionCard>
            </div>
          </>
        ) : null}
      </ProductGrid>
    </AppShell>
  );
}
