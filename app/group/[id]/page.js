import { notFound } from 'next/navigation';
import { getWarehouse, settleWarehouse, escrowMode } from '@/lib/group';
import { fmtDate } from '@/lib/format';
import GroupProgress from '@/components/GroupProgress';
import GroupBuy from '@/components/GroupBuy';

export const dynamic = 'force-dynamic';

export default async function WarehousePage({ params }) {
  await settleWarehouse(params.id).catch(() => {});
  const w = getWarehouse(params.id);
  if (!w) notFound();
  const mode = escrowMode();
  const canJoin = mode !== 'disabled' && ['open', 'reached'].includes(w.status) && !(w.deadline && new Date(w.deadline) < new Date());
  return (
    <>
      <h1>{w.name}</h1>
      {w.description && <p className="lead">{w.description}</p>}
      <div className="soft" style={{ marginBottom: 40 }}>
        <GroupProgress id={w.id} initial={{ ...w.progress, status: w.status, deadline: w.deadline, currency: w.currency }} />
        {w.deadline && <p className="muted" style={{ margin: '8px 0 0' }}>Краен срок: {fmtDate(w.deadline)}</p>}
      </div>
      {mode === 'disabled' && <p className="err">Груповите покупки са недостъпни: плащанията не са настроени.</p>}
      <GroupBuy warehouseId={w.id} items={w.items} currency={w.currency} canJoin={canJoin} demo={mode === 'demo'} />
    </>
  );
}
