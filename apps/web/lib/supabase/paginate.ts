// PostgREST no devuelve más de mil filas por petición, y `.limit(n)` con n mayor
// las recorta en silencio: no hay error, simplemente faltan. Con el catálogo
// completo eso son piezas que existen en la base pero no aparecen en el POS ni en
// Inventario, que es la peor forma de fallar — nadie se entera.
//
// Esto recorre la consulta por páginas hasta que se acaban las filas.
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
  size = 1000,
  max = 50000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, from + size - 1);
    // Con lo que ya se trajo se sigue: media lista es mejor que una pantalla en
    // blanco, y el hueco se nota antes que un error silencioso.
    if (error) break;
    const rows = (data as T[] | null) ?? [];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}
