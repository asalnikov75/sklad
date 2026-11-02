import Link from 'next/link';
import { money, imageUrl } from '@/lib/format';
import { finalPrice } from '@/lib/pricing';

/** Product tile used on every listing page. Shows the promotion badge and the recalculated price automatically. */
export default function ProductCard({ p, promoted = false }) {
  const fp = finalPrice(p);
  return (
    <Link href={`/product/${p.id}`} className="card">
      <div className="imgwrap">
        {p.image ? <img className="ph" src={imageUrl(p.image)} alt={p.title} loading="lazy" /> : <div className="ph" />}
        {p.discount > 0 && <span className="badge-sale">−{p.discount}%</span>}
        {promoted && <span className="badge-ad">Промотиран</span>}
      </div>
      <div className="body">
        <h3>{p.title}</h3>
        <div className="row" style={{ gap: 0, flexWrap: 'wrap' }}>
          <span className="price">{money(fp)}</span>
          {p.discount > 0 && <s className="old">{money(p.price)}</s>}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
          {p.stock < 1 ? <span className="pill bad">Изчерпан</span> : p.stock <= 3 ? <span className="pill warn">Остават {p.stock}</span> : <span className="sub">{p.subcategory !== 'Друго' ? p.subcategory : p.category}</span>}
        </div>
      </div>
    </Link>
  );
}
