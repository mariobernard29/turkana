// Etiquetas y estilos del estado de una venta/pedido.
// Antes se exportaban desde app/admin/pedidos/page.tsx y las importaban otras
// páginas (importar de un `page` es un antipatrón en App Router).

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  preparing: "Preparando",
  shipped: "Enviado",
  delivered: "Entregado",
  completed: "Completado",
  cancelled: "Cancelado",
};

export const ORDER_STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  paid: "bg-blue-50 text-blue-700",
  preparing: "bg-indigo-50 text-indigo-700",
  shipped: "bg-violet-50 text-violet-700",
  delivered: "bg-teal-50 text-teal-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};
