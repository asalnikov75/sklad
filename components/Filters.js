import Link from 'next/link';
import { conditionLabel } from '@/lib/format';

/** Builds a catalog URL keeping the current search/filters except the overrides. */
export function buildUrl(sp, overrides = {}) {
  const p = new URLSearchParams();
  const merged = { ...sp, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null || v === '' || k === 'p') continue;
    p.set(k, Array.isArray(v) ? v.join('|') : String(v));
  }
  const s = p.toString();
  return s ? `/?${s}` : '/';
}

/**
 * Left sidebar: category tree, price range, brands, condition, availability, promotions.
 * Plain GET form + links (no client JS). On phones it collapses behind a "Филтри" button (CSS checkbox toggle).
 */
export default function Filters({ sp, facets, currency }) {
  const cat = sp.cat || '', sub = sp.sub || '';
  const sel = (k) => String(sp[k] || '').split('|').filter(Boolean);
  const brands = sel('brand'), conds = sel('cond');
  const active = ['cat', 'sub', 'min', 'max', 'brand', 'cond', 'stock', 'sale'].some((k) => sp[k]);
  return (
    <aside aria-label="Филтри">
      <input type="checkbox" id="ftoggle" className="ftoggle" />
      <label htmlFor="ftoggle" className="fbtn">☰ Филтри{active ? ' •' : ''}</label>
      <form className="fpanel" action="/" method="get">
        {sp.q && <input type="hidden" name="q" value={sp.q} />}
        {cat && <input type="hidden" name="cat" value={cat} />}
        {sub && <input type="hidden" name="sub" value={sub} />}

        <h3>Категории</h3>
        <div className="cat">
          <Link href={buildUrl(sp, { cat: '', sub: '' })} className={!cat ? 'on' : ''}>Всички</Link>
          {facets.categories.map((c) => (
            <div key={c.name}>
              <Link href={buildUrl(sp, { cat: c.name, sub: '' })} className={cat === c.name && !sub ? 'on' : ''}>{c.name} <span>{c.count}</span></Link>
              {cat === c.name && c.subs.length > 0 && (
                <div className="subs">
                  {c.subs.map((s) => <Link key={s.name} href={buildUrl(sp, { cat: c.name, sub: s.name })} className={sub === s.name ? 'on' : ''}>{s.name} <span>{s.count}</span></Link>)}
                </div>
              )}
            </div>
          ))}
        </div>

        <h3>Цена ({currency})</h3>
        <div className="pricerow">
          <input name="min" type="number" min="0" step="1" inputMode="decimal" placeholder={facets.price ? `от ${facets.price.min}` : 'от'} defaultValue={sp.min || ''} aria-label="Минимална цена" />
          <input name="max" type="number" min="0" step="1" inputMode="decimal" placeholder={facets.price ? `до ${facets.price.max}` : 'до'} defaultValue={sp.max || ''} aria-label="Максимална цена" />
        </div>

        {facets.brands.length > 0 && (<>
          <h3>Марка</h3>
          {facets.brands.map((b) => (
            <label key={b.name} className="check"><input type="checkbox" name="brand" value={b.name} defaultChecked={brands.includes(b.name)} /> {b.name} <span className="muted">({b.count})</span></label>
          ))}
        </>)}

        {facets.conditions.length > 1 && (<>
          <h3>Състояние</h3>
          {facets.conditions.map((c) => (
            <label key={c.name} className="check"><input type="checkbox" name="cond" value={c.name} defaultChecked={conds.includes(c.name)} /> {conditionLabel(c.name)} <span className="muted">({c.count})</span></label>
          ))}
        </>)}

        <h3>Наличност и промоции</h3>
        <label className="check"><input type="checkbox" name="stock" value="1" defaultChecked={sp.stock === '1'} /> Само налични</label>
        <label className="check"><input type="checkbox" name="sale" value="1" defaultChecked={sp.sale === '1'} /> Само с промоция{facets.onSale ? <span className="muted">({facets.onSale})</span> : null}</label>

        <div className="row" style={{ marginTop: 22 }}>
          <button className="btn sm" type="submit">Приложи</button>
          {active && <Link className="muted link" href={sp.q ? `/?q=${encodeURIComponent(sp.q)}` : '/'}>Изчисти</Link>}
        </div>
      </form>
    </aside>
  );
}
