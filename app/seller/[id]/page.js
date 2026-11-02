import { notFound } from 'next/navigation';
import { getSeller, listProducts } from '@/lib/db';
import ProductCard from '@/components/ProductCard';

export const dynamic = 'force-dynamic';

export default function SellerPage({ params }) {
  const s = getSeller(params.id);
  if (!s) notFound();
  const items = listProducts({ status: 'published', sellerId: s.id });
  return (
    <>
      <div className="row" style={{ gap: 18, marginBottom: 48 }}>
        <div className="avatar" style={{ width: 64, height: 64, fontSize: 24 }}>{s.name.slice(0, 1).toUpperCase()}</div>
        <div>
          <h1 style={{ marginBottom: 2 }}>{s.name}</h1>
          <p className="muted" style={{ margin: 0 }}>{[s.location, `Продава от ${new Date(s.since).getFullYear()}`].filter(Boolean).join(' · ')}</p>
          <p style={{ margin: '6px 0 0' }}><a className="link muted" href={`/api/pricelist?seller=${s.id}`}>Свали ценова листа (CSV)</a></p>
        </div>
      </div>
      {s.bio && <p className="lead" style={{ marginTop: -16 }}>{s.bio}</p>}
      {items.length === 0 ? <p className="muted">В момента няма продукти за продажба.</p> : <div className="grid">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
    </>
  );
}
