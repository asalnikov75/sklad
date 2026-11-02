import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { listUsersForAdmin, listAllProductsForAdmin, listAllMessagesForAdmin } from '@/lib/db';
import { listAllAds } from '@/lib/ads';
import { listAllWarehousesAdmin, escrowMode } from '@/lib/group';
import AdminClient from '@/components/AdminClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Администрация' };

export default function AdminPage() {
  const user = currentUser();
  if (!user) redirect('/login');
  if (!user.is_admin) notFound(); // don't reveal that the page exists to non-admins
  return (
    <AdminClient
      me={user.id}
      initialUsers={listUsersForAdmin()}
      initialProducts={listAllProductsForAdmin()}
      initialMessages={listAllMessagesForAdmin()}
      initialAds={listAllAds()}
      initialWarehouses={listAllWarehousesAdmin()}
      escrow={escrowMode()}
    />
  );
}
