// Seller promotions. `price` on a product is the REGULAR price; the displayed/charged price is finalPrice().
export const DISCOUNTS = [0, 10, 20, 30, 40, 50];

export const validDiscount = (d) => (DISCOUNTS.includes(Number(d)) ? Number(d) : 0);

export function finalPrice(p) {
  const d = validDiscount(p.discount);
  return Math.round((Number(p.price) || 0) * (100 - d)) / 100;
}
