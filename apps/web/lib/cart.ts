// Carrito ligero en localStorage. Fuente de verdad del checkout (que valida
// precios y stock en el servidor antes de cobrar). Solo usar en el cliente.
export type CartItem = {
  variantId: string;
  productSlug: string;
  name: string;
  sku: string;
  priceCents: number;
  image: string | null;
  qty: number;
};

const KEY = "turkana_cart";

export function getCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as CartItem[];
  } catch {
    return [];
  }
}

function save(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("turkana-cart"));
}

export function addToCart(item: Omit<CartItem, "qty">, qty = 1) {
  const cart = getCart();
  const existing = cart.find((c) => c.variantId === item.variantId);
  if (existing) existing.qty += qty;
  else cart.push({ ...item, qty });
  save(cart);
}

export function setQty(variantId: string, qty: number) {
  const cart = getCart().map((c) => (c.variantId === variantId ? { ...c, qty } : c));
  save(cart.filter((c) => c.qty > 0));
}

export function removeFromCart(variantId: string) {
  save(getCart().filter((c) => c.variantId !== variantId));
}

export function cartCount(): number {
  return getCart().reduce((n, c) => n + c.qty, 0);
}

export function cartSubtotalCents(): number {
  return getCart().reduce((s, c) => s + c.priceCents * c.qty, 0);
}
