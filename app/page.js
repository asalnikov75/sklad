import Link from 'next/link';
import { browse, smartSearch, filtersFromParams } from '@/lib/search';
import { bannerFor, featuredFor } from '@/lib/ads';
import { finalPrice } from '@/lib/pricing';
import { money, imageUrl, CURRENCY } from '@/lib/format';
import ProductCard from '@/components/ProductCard';
import Filters, { buildUrl } from '@/components/Filters';

export const dynamic = 'force-dynamic';

function Banner({ b }) {
  const p = b.product;
  return (
    <Link href={`/product/${p.id}`} className="banner">
      <span className="tag">Реклама</span>
      {p.image && <img src={imageUrl(p.image)} alt={p.title} />}
      <div className="txt">
        <h2>{b.ad.headline || p.title}</h2>
        <div><span className="price" style={{ fontSize: 20 }}>{money(finalPrice(p))}</span>{p.discount > 0 && <s className="old">{money(p.price)}</s>}</div>
        <span className="btn sm" style={{ alignSelf: 'flex-start' }}>Виж продукта</span>
      </div>
    </Link>
  );
}

function pageUrl(sp, n) {
  const u = buildUrl(sp, {});
  return n <= 1 ? u : `${u}${u.includes('?') ? '&' : '?'}p=${n}`;
}

function Grid({ items, boost }) {
  return <div className="grid">{items.map((p) => <ProductCard key={p.id} p={p} promoted={boost?.has(p.sellerId)} />)}</div>;
}

export default async function Home({ searchParams }) {
  const sp = searchParams || {};
  const q = (sp.q || '').toString().trim().slice(0, 120);
  const filters = filtersFromParams(sp);
  const page = Math.max(1, parseInt(sp.p, 10) || 1);

  let content, facets, title;
  if (q) {
    const r = await smartSearch(q, filters);
    facets = r.facets; title = `Резултати за „${q}“`;
    const none = !r.stage1.length && !r.stage2.length && !r.stage3.length;
    content = (
      <>
        {none && <div className="soft"><p style={{ margin: 0 }}>Няма намерени продукти.</p><p className="muted" style={{ margin: '6px 0 0' }}>Опитайте с други думи или махнете някои филтри.</p></div>}
        {r.stage1.length > 0 && <section><h2>Точни съвпадения <span className="muted">({r.stage1.length})</span></h2><Grid items={r.stage1} boost={r.boost} /></section>}
        {r.stage2.length > 0 && <section className="section"><h2>Подобни продукти</h2><Grid items={r.stage2} boost={r.boost} /></section>}
        {r.stage3.length > 0 && <section className="section"><h2>Често купувани заедно</h2><p className="muted" style={{ marginTop: -8 }}>Допълващи продукти към вашето търсене.</p><Grid items={r.stage3} boost={r.boost} /></section>}
      </>
    );
  } else {
    const r = browse(filters, page);
    facets = r.facets;
    title = filters.subcategory || filters.category || 'Открийте нещо хубаво';
    const firstPage = page === 1;
    const banner = firstPage ? bannerFor(filters.category || 'home') : null;
    const featured = firstPage && filters.category && !filters.subcategory ? featuredFor(filters.category) : [];
    const fIds = new Set(featured.map((p) => p.id));
    const items = r.items.filter((p) => !fIds.has(p.id));
    const hasFilters = Object.values(filters).some((v) => (Array.isArray(v) ? v.length : v));
    content = (
      <>
        {banner && <Banner b={banner} />}
        {featured.length > 0 && <section className="section" style={{ marginTop: 0, marginBottom: 40 }}><h2>Препоръчани <span className="muted">· реклама</span></h2><Grid items={featured} /></section>}
        {r.total === 0 ? (
          <div className="soft">
            <p style={{ margin: 0 }}>{hasFilters ? 'Няма продукти с тези филтри.' : 'Все още няма продукти.'}</p>
            {!hasFilters && <p className="muted" style={{ margin: '6px 0 0' }}><Link href="/register" className="link">Създайте профил на продавач</Link> и качете снимки, за да публикувате първите си продукти.</p>}
          </div>
        ) : <Grid items={items} boost={r.boost} />}
        {r.pages > 1 && (
          <nav className="pager" aria-label="Страници">
            {page > 1 ? <Link className="btn ghost sm" href={pageUrl(sp, page - 1)}>← Назад</Link> : <span />}
            <span className="muted">Стр. {page} от {r.pages}</span>
            {page < r.pages ? <Link className="btn ghost sm" href={pageUrl(sp, page + 1)}>Напред →</Link> : <span />}
          </nav>
        )}
      </>
    );
  }

  return (
    <>
      <h1>{title}</h1>
      {!q && !filters.category && <p className="lead">Продукти от независими продавачи – снимани, описани и на честна цена.</p>}
      <div className="catalog" style={{ marginTop: 24 }}>
        <Filters sp={sp} facets={facets} currency={CURRENCY} />
        <div>{content}</div>
      </div>
    </>
  );
}
