import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct, getSeller } from '@/lib/db';
import { relatedFor } from '@/lib/search';
import { activeBoostSellers } from '@/lib/ads';
import { finalPrice } from '@/lib/pricing';
import { money, imageUrl, conditionLabel } from '@/lib/format';
import AddToCart from '@/components/AddToCart';
import InquiryForm from '@/components/InquiryForm';
import ProductCard from '@/components/ProductCard';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  const p = getProduct(params.id);
  return p ? { title: p.title, description: p.description.slice(0, 160) } : {};
}

export default function ProductPage({ params }) {
  const p = getProduct(params.id);
  if (!p || p.status !== 'published') notFound();
  const seller = p.sellerId ? getSeller(p.sellerId) : null;
  const { sameSeller, similar } = relatedFor(p);
  const boost = activeBoostSellers();
  const fp = finalPrice(p);
  const crumbs = [p.category, p.subcategory && p.subcategory !== 'Друго' ? p.subcategory : ''].filter(Boolean);

  return (
    <>
      <div className="detail">
        {p.image ? <img src={imageUrl(p.image)} alt={p.title} /> : <div className="noimg" />}
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href={`/?cat=${encodeURIComponent(p.category)}`} className="link">{p.category}</Link>
            {crumbs[1] && <> › <Link href={`/?cat=${encodeURIComponent(p.category)}&sub=${encodeURIComponent(crumbs[1])}`} className="link">{crumbs[1]}</Link></>}
            {p.condition !== 'unknown' ? ` · ${conditionLabel(p.condition)}` : ''}
          </p>
          <h1 style={{ marginTop: 8, fontSize: 'clamp(24px,4vw,36px)' }}>{p.title}</h1>
          {(p.brand || p.model || p.sku) && <p className="muted" style={{ margin: 0 }}>{[p.brand && `Марка: ${p.brand}`, p.model && `Модел: ${p.model}`, p.sku && `Арт. №: ${p.sku}`].filter(Boolean).join(' · ')}</p>}
          <p className="price-lg">
            {money(fp)}
            {p.discount > 0 && <><s>{money(p.price)}</s><span className="pill" style={{ background: 'var(--sale)', color: '#fff' }}>−{p.discount}%</span></>}
          </p>
          {p.priceBasis === 'market' && p.marketAvg > 0 && p.discount === 0 && (
            <p className="muted" style={{ margin: '2px 0 0' }}>Типична онлайн цена {money(p.marketAvg)}, около {p.discountPct}% по-ниска тук.</p>
          )}
          <p style={{ whiteSpace: 'pre-line', margin: '28px 0' }}>{p.description}</p>
          {p.tags?.length > 0 && <p className="muted">{p.tags.map((t) => `#${t}`).join('  ')}</p>}
          <div className="stockline">
            <span className={`dotg ${p.stock < 1 ? 'out' : p.stock <= 3 ? 'low' : ''}`} />
            <span className="muted">{p.stock < 1 ? 'Изчерпан' : p.stock <= 3 ? `Остават само ${p.stock} бр.` : `В наличност: ${p.stock} бр.`}</span>
          </div>
          <AddToCart product={{ id: p.id, title: p.title, price: fp, regular: p.price, discount: p.discount, image: p.image, stock: p.stock }} />

          {seller && (
            <div className="seller-card">
              <div className="avatar" aria-hidden="true">{seller.name.slice(0, 1).toUpperCase()}</div>
              <div>
                <Link href={`/seller/${seller.id}`} style={{ fontWeight: 600 }}>{seller.name}</Link>
                <div className="muted">{[seller.location, `Продава от ${new Date(seller.since).getFullYear()}`, `${seller.listings} продукта`].filter(Boolean).join(' · ')}</div>
                {seller.bio && <div className="muted" style={{ marginTop: 4 }}>{seller.bio}</div>}
              </div>
            </div>
          )}
          {seller && <InquiryForm productId={p.id} sellerName={seller.name} />}
        </div>
      </div>

      {sameSeller.length > 0 && (
        <section className="section">
          <h2>Още от {seller?.name || 'този продавач'}</h2>
          <div className="grid">{sameSeller.map((x) => <ProductCard key={x.id} p={x} promoted={boost.has(x.sellerId)} />)}</div>
        </section>
      )}
      {similar.length > 0 && (
        <section className="section">
          <h2>Подобни продукти от други продавачи</h2>
          <div className="grid">{similar.map((x) => <ProductCard key={x.id} p={x} promoted={boost.has(x.sellerId)} />)}</div>
        </section>
      )}
    </>
  );
}
