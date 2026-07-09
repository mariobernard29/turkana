"use client";

import { useEffect } from "react";

// Vacía el carrito al llegar a la página de éxito.
export function ClearCart() {
  useEffect(() => {
    try {
      localStorage.removeItem("turkana_cart");
      window.dispatchEvent(new Event("turkana-cart"));
    } catch {
      /* noop */
    }
  }, []);
  return null;
}
