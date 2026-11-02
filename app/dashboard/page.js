import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/session';
import { listProducts, listMessages, listOrdersForSeller } from '@/lib/db';
import { reconcileSellerAds } from '@/lib/ads';
import { warehousesOwnedBy } from '@/lib/group';
import { aiStatus } from '@/lib/ai';
import { bgProvider } from '@/lib/image';
import DashboardClient from '@/components/DashboardClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Табло на продавача' };

export default async function Dashboard({ searchParams }) {
  const user = currentUser();
  if (!user) redirect('/login');
  // Coming back from Stripe Checkout for an ad: confirm payment even if the webhook has not arrived yet.
  await reconcileSellerAds(user.id).catch(() => {});
  return (
    <DashboardClient
      initialUser={user}
      initialProducts={listProducts({ sellerId: user.id })}
      initialMessages={listMessages(user.id)}
      initialOrders={listOrdersForSeller(user.id)}
      initialWarehouses={warehousesOwnedBy(user.id)}
      initialTab={['listings', 'pricelist', 'ads', 'inbox', 'orders', 'warehouse', 'profile'].includes(searchParams?.tab) ? searchParams.tab : 'listings'}
      status={{ ...aiStatus(), bg: bgProvider() }}
    />
  );
}
