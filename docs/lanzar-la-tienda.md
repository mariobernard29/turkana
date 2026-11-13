# Lanzar la tienda en línea — paso a paso

Guía de punta a punta para abrir la tienda al público: elegir qué piezas salen,
dejar Stripe cobrando de verdad y probar antes de anunciar.

La tienda vive hoy en <https://turkana-phi.vercel.app>; el dominio comprado es
`turkanajewerly.com` y todavía no está conectado.

Léela en orden. Las partes 1 y 2 se pueden hacer en paralelo (una es trabajo de
catálogo, la otra de configuración), pero **no abras la tienda sin la parte 4**.

---

## Dónde estamos hoy (13 de noviembre de 2026)

| Cosa | Estado |
|------|--------|
| Piezas en el catálogo | 1,144 activas (más 272 archivadas) |
| Piezas publicadas en la tienda | **0 — todas ocultas a propósito** |
| Piezas con foto | ninguna de las que estaban publicadas |
| Tienda en vivo | <https://turkana-phi.vercel.app> — **con código viejo** |
| Stripe | **Modo prueba** (`pk_test` / `sk_test`) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |
| Correos (Resend) | Configurados para `contacto@turkanajewerly.com` |
| POS y admin | Funcionando |

> ⚠️ **Lo publicado en Vercel todavía trae el código anterior.** Ahí se ve hoy el
> recado para el admin en la portada y los 60 filtros de categorías vacías. Los
> arreglos de este documento están en tu computadora, sin subir. **Haz el
> despliegue antes de seguir** (Parte 3), o vas a configurar Stripe contra una
> versión que no es la buena.

La tienda arranca **vacía a propósito**. Todo el catálogo entró por Excel para
poder cobrar en el mostrador, pero la web necesita foto y textos revisados, y eso
se hace pieza por pieza. Desde ahora, **toda pieza nueva nace oculta** y sólo sale
a la web cuando tú la publicas.

---

## Parte 1 — Elegir y publicar las piezas

### 1.1 Preparar la pieza

Entra a **Admin → Productos**. Usa el filtro **Tienda en línea → Ocultas** para
ver lo que falta por publicar, y el buscador para encontrar la pieza.

Abre la pieza y revisa:

1. **Fotos.** Mínimo una; lo ideal son 3 o 4 (frente, detalle, puesta). Es lo
   único que vende en línea. La primera foto es la que sale en el listado.
2. **Nombre.** Como lo leería una clienta, no como viene del proveedor.
   `ANILLO AGOSTO` → `Anillo Agosto · Plata .925`.
3. **Descripción corta.** Una línea. Sale debajo del nombre.
4. **Descripción larga.** Material, medidas, cuidados.
5. **Categoría.** Sin categoría, la pieza no aparece en ningún filtro de la tienda.
6. **Precio.** Ya trae IVA incluido (así lo calcula el checkout).
7. **Estado = Activo.** En borrador o archivada no sale, aunque la publiques.

### 1.2 Publicarla

En la lista de productos, columna **Tienda en línea**, da clic en el botón
**Oculta** → pasa a **En la tienda** y ya es visible para el público.

El botón se niega a publicar (y te dice por qué) si:

- la pieza no está en **Activo**;
- **no tiene ninguna foto** — ahí aparece el iconito ámbar de "sin foto";
- no tiene ninguna talla a la venta;
- su categoría está oculta en la tienda.

Para quitarla, el mismo botón. Nunca se bloquea: puedes despublicar al instante.

### 1.3 Categorías

Las categorías se administran arriba de la lista, en **Categorías**. Dos cosas:

- **Una categoría oculta esconde todas sus piezas**, aunque estén publicadas.
- En la tienda **sólo salen las categorías que tienen al menos una pieza
  publicada.** No tienes que ir ocultando las 60 vacías a mano.

> Hay categorías duplicadas de la importación (`ACERO QUIRUGICO` y
> `ACERO QUIRURGICO`, `DIJE` y `DIJES`, `PULSERAS` y `PULSERAS ITALIANAS`…).
> No estorban mientras estén vacías, pero conviene limpiarlas antes de publicar
> mucho, para no partir una misma categoría en dos filtros.

### 1.4 La portada

- Marca **Destacado** en 4 piezas: son las que salen en "Productos destacados".
  Si no hay ninguna destacada, salen las 4 publicadas más recientes.
- Si no hay **nada** publicado, la sección entera desaparece de la portada
  (antes salía ahí un recado para el admin, a la vista de la clienta).
- Banners, hero y colección destacada se editan en **Admin → Ajustes → Contenido**.

### 1.5 Cuántas para abrir

Con **20 a 30 piezas bien hechas** la tienda se ve completa. Mejor eso que 200 a
medias: cada pieza sin foto que se cuele resta más de lo que suma.

---

## Parte 2 — Stripe en vivo

El detalle largo está en [`STRIPE_SETUP.md`](../STRIPE_SETUP.md); esto es el
resumen de lo que falta.

### 2.1 Activar la cuenta

Stripe → **Settings → Business settings**: RFC, CLABE, domicilio fiscal y
**statement descriptor** `TURKANA JEWELRY` (es lo que la clienta ve en su estado
de cuenta; si dice otra cosa, llegan aclaraciones).

Sin la cuenta activada sólo existe el modo prueba.

### 2.2 Métodos de pago

**Settings → Payments → Payment methods**: tarjetas ✅, **OXXO ✅**, SPEI ❌.

OXXO topa alrededor de $10,000 MXN por voucher y el pago tarda hasta 3 días.

### 2.3 Claves live

**Developers → API keys**, con el interruptor en **Live**:

| Variable | Valor |
|----------|-------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` |
| `STRIPE_SECRET_KEY` | `sk_live_…` |

Van en **Vercel → Settings → Environment Variables**, entorno **Production**.
La `sk_live_` nunca en el navegador ni en el POS.

### 2.4 Webhook ← esto es lo que falta y lo que más duele si se olvida

El webhook es el que marca la orden como pagada, descuenta el inventario, canjea
el saldo Rewards y manda los correos. **Sin él, la clienta paga y la orden se
queda en "pendiente" para siempre.**

1. Stripe (modo **Live**) → **Developers → Webhooks → Add endpoint**.
2. URL — **la de la dirección que esté usando la tienda**:
   - hoy, con la de Vercel: `https://turkana-phi.vercel.app/api/stripe/webhook`
   - cuando conectes el dominio: `https://turkanajewerly.com/api/stripe/webhook`

   > Si cambias de dirección después, **actualiza también el endpoint en Stripe**.
   > Si se queda apuntando a la vieja y la nueva no responde, las clientas pagan y
   > las órdenes se quedan en "pendiente". Puedes tener los dos endpoints dados de
   > alta mientras haces el cambio, no estorba.
3. Eventos (exactamente estos cuatro):
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
4. Copia el **Signing secret** (`whsec_…`) → Vercel, `STRIPE_WEBHOOK_SECRET`.
5. **Vuelve a desplegar** para que tome las variables nuevas.

> El `whsec_` de prueba y el de live son distintos. Si queda el de prueba, Stripe
> manda el evento, la firma no cuadra y la orden nunca se marca pagada. En los
> logs de Vercel se ve como `[webhook] firma inválida`.

### 2.5 Branding

**Settings → Branding**: logo y color. Es la página donde la clienta mete su
tarjeta; con el logo se ve que sigue en Turkana.

---

## Parte 3 — Dominio, variables y despliegue

En **Vercel → Settings → Environment Variables** (entorno Production) tienen que
estar las nueve:

| Variable | Valor |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | el del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | el del proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | el del proyecto — **nunca** en el repo |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` |
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` del endpoint live |
| `NEXT_PUBLIC_SITE_URL` | `https://turkana-phi.vercel.app` (sin diagonal final) |
| `RESEND_API_KEY` | el de Resend |
| `EMAIL_FROM` | `Turkana Jewelry <contacto@turkanajewerly.com>` |

`NEXT_PUBLIC_SITE_URL` es con la que se arman las ligas de regreso de Stripe. Hoy
apunta a `localhost`: si se queda así, la clienta paga y Stripe la manda a una
página que sólo existe en tu computadora. **Ponla con la dirección que esté
usando la tienda** — hoy la de Vercel; el día que conectes el dominio, cámbiala a
`https://turkanajewerly.com` y actualiza también el webhook en Stripe (2.4).

> El dominio es **`turkanajewerly.com`**, con "jewerly". Así se compró y así está
> verificado en Resend. Escríbelo igual en Stripe, Vercel y DNS.

### 3.1 Desplegar

Los arreglos de hoy están sólo en tu computadora. Lo que está en vivo todavía
trae el código viejo. Para subirlo:

```bash
git add -A && git commit -m "Tienda en línea: publicación manual y arreglos previos al lanzamiento"
```

```bash
git push
```

Vercel despliega solo al recibir el push. Toma unos dos minutos.

Cuando esté, `/api/health` responde con las variables que sí llegaron:
<https://turkana-phi.vercel.app/api/health>

---

## Parte 4 — Probar antes de anunciar

No la anuncies hasta pasar esta lista. Hazla **en la tienda en vivo**
(<https://turkana-phi.vercel.app>, o el dominio si ya lo conectaste), **después de
desplegar** — no en tu computadora.

**Catálogo**

- [ ] `/tienda` muestra sólo las piezas que publicaste, todas con foto.
- [ ] Los filtros de categoría no llevan a "no hay productos en esta vista".
- [ ] La portada se ve completa (destacados, banners, colección).
- [ ] Abrir una pieza **no** publicada por su liga directa da 404.

**Una compra real, con tu propia tarjeta, de una pieza barata**

- [ ] Agregar al carrito, llegar al checkout.
- [ ] El envío cobra bien: $110 estándar, $159 express, **gratis desde $1,999**.
- [ ] Stripe muestra el logo de Turkana.
- [ ] Al pagar, regresa a `/checkout/exito` (no a localhost).
- [ ] En **Admin → Ventas** la orden aparece como **pagada** (no "pendiente").
      Si se queda en pendiente → el webhook (2.4).
- [ ] Llegó el correo de confirmación a la clienta.
- [ ] Llegó el aviso de venta al admin.
- [ ] **El inventario bajó** en esa pieza.
- [ ] Marcar enviado con guía desde el admin → llega el correo con el número.
- [ ] Reembolsar desde Stripe → la orden queda como reembolsada.

**OXXO**

- [ ] Una orden con OXXO genera el voucher y avisa "OXXO pendiente de pago".
- [ ] Al pagarse, la orden pasa a pagada y descuenta inventario.

**Rewards**

- [ ] Crear cuenta en `/rewards/acceso`, llega el correo de confirmación.
- [ ] Canjear saldo en el checkout descuenta el monto correcto.

**Celular**

- [ ] Toda la compra desde un teléfono: ahí va a venir la mayoría.

---

## Parte 5 — Lo que queda pendiente

Cosas que están ahí y conviene decidir antes o poco después de abrir.

### Sobreventa entre el mostrador y la web (lo más importante)

Hay **una sola bolsa de existencias** para el POS y la web, y el inventario se
descuenta **hasta que el pago se confirma**, no al poner la pieza en el carrito.
En joyería, donde muchas piezas son únicas, eso significa que:

- dos clientas pueden pagar en línea la misma pieza con segundos de diferencia;
- con **OXXO el hueco es de hasta 3 días**: la clienta aparta con voucher, la
  pieza se vende en el mostrador, y cuando va a pagar ya no existe.

Mitigación de hoy: publicar en línea sobre todo piezas de las que haya **2 o más**,
y revisar los pedidos OXXO pendientes a diario. La solución de fondo es apartar el
inventario al crear la orden y liberarlo si el voucher vence — es un cambio de
varios días, dime si lo quieres antes de abrir.

### Catálogo visible por la API pública — ✅ resuelto el 13/11/2026

Hasta hoy, "oculto en tienda" sólo escondía la pieza en las páginas: la API
pública de Supabase devolvía las 1,144 piezas con nombre, SKU y precio a
cualquiera que supiera pedirlas con la llave anon (que viaja en el navegador de
quien abra la tienda).

Ya está cerrado en la base
([`migración 0035`](../supabase/migrations/0035_catalogo_publico_solo_publicado.sql)):
esa llamada ahora devuelve **0 filas**. El admin y el POS no se afectaron, siguen
viendo las 1,431 piezas porque leen con la llave de servicio.

### Menores

- **Sin `robots.txt` ni `sitemap.xml`.** Google tarda más en encontrar la tienda.
- **Categorías duplicadas** de la importación (ver 1.3).
- **El pie de página** tiene ligas fijas a Anillos, Collares y Pulseras. Si abres
  sin nada publicado en alguna de las tres, esa liga cae en "no hay productos en
  esta vista". Publica al menos una pieza de cada una, o dime y las hago dinámicas.
- **Protección de contraseñas filtradas** desactivada en Supabase Auth
  (Authentication → Policies, es un interruptor).
- **`supabase/functions/create-checkout`** es código muerto de una versión vieja;
  el cobro y el webhook viven en la app de Next.js.
- **`apps/web/_tmp_arch.mjs`** quedó suelto de una prueba, se puede borrar.

---

## Resumen de un vistazo

1. **Despliega** lo que está en tu computadora (Parte 3.1) — es lo primero.
2. Publica 20–30 piezas con foto y textos (Parte 1).
3. Activa Stripe, pon las claves live y **crea el webhook** (Parte 2).
4. Variables en Vercel, sobre todo `NEXT_PUBLIC_SITE_URL` (Parte 3).
5. Compra real de prueba de punta a punta (Parte 4).
6. Decide qué hacer con la sobreventa (Parte 5).
7. Anuncia.
