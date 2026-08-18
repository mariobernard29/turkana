# Dejar el sistema instalado en la tienda

Guía para el día que se monta todo en Los Mochis: la computadora del mostrador,
el iPad y la impresora. Al final, el personal no tiene que abrir una terminal ni
escribir un comando nunca.

Orden importa: el paso 1 es requisito de todo lo demás.

---

## 1. Publicar el sistema en internet

**Esto todavía no está hecho.** Hoy `turkanajewerly.com` muestra la página de
dominio estacionado de Hostinger, no la aplicación. Sin una dirección pública no
hay nada que abrir en la computadora ni en el iPad.

El código ya está en GitHub (`mariobernard29/turkana`, rama `main`).

1. Entra a [vercel.com](https://vercel.com) con la cuenta de Turkana y crea un
   proyecto nuevo importando ese repositorio.
2. **Root Directory: `apps/web`.** El repositorio no tiene `package.json` en la
   raíz; si no se cambia esto, la compilación falla.
3. Copia las variables de entorno desde tu `.env.local`:

   | Variable | Nota |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | igual que en desarrollo |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | igual |
   | `SUPABASE_SERVICE_ROLE_KEY` | **secreta**, sólo en Vercel |
   | `NEXT_PUBLIC_SITE_URL` | aquí sí cambia: `https://turkanajewerly.com` |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | |
   | `STRIPE_SECRET_KEY` | **secreta** |
   | `STRIPE_WEBHOOK_SECRET` | el del endpoint de producción |
   | `RESEND_API_KEY` | **secreta** |
   | `EMAIL_FROM` | `contacto@turkanajewerly.com` |
   | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | |

4. Apunta el dominio: en Vercel agrega `turkanajewerly.com`, y en Hostinger
   cambia los registros DNS a los que te indique Vercel. Quita la página
   estacionada. Tarda desde minutos hasta unas horas en propagar.
5. En Supabase → Authentication → URL Configuration, pon la **Site URL** en
   `https://turkanajewerly.com` y agrega a *Redirect URLs*:
   `https://turkanajewerly.com/auth/confirm` y
   `https://turkanajewerly.com/actualizar-contrasena`. Sin esto, recuperar
   contraseña y confirmar cuenta de Rewards se rompen.

Comprueba que `https://turkanajewerly.com/pos` te mande a la pantalla de entrada
del personal antes de seguir.

> Cobros en línea con tarjeta (claves *live* de Stripe y webhook de producción)
> es una lista aparte: ver `STRIPE_SETUP.md`. El punto de venta de la tienda no
> los necesita.

---

## 2. La impresora

1. Enciéndela y conéctala por cable de red al mismo switch/router que la
   computadora del mostrador.
2. Dale **IP fija**, o mejor, una reserva de DHCP en el router para su dirección
   MAC. Con IP suelta, el día que el router se la cambie deja de imprimir.
3. Anota esa IP. Hoy es `192.168.100.27`.

---

## 3. La computadora del mostrador

### 3.1 El agente de impresión

Es lo que hace que el ticket salga sin la ventana de impresión del navegador.

1. Instala **Node.js** desde [nodejs.org](https://nodejs.org) (versión 20 o más).
2. Copia la carpeta `tools/print-agent` a la computadora, por ejemplo a
   `C:\Turkana\print-agent`. Sirve una USB; no hace falta git.

   *Truco:* si copias la carpeta **después** de haber corrido `npm install` en
   tu máquina, se lleva `node_modules` dentro y la computadora de la tienda no
   necesita descargar nada.

3. Deja ahí el archivo `.env` con los mismos valores que ya funcionan
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AGENT_EMAIL`, `AGENT_PASSWORD`,
   `PRINTER_ID`, `PRINTER_HOST`, `PRINTER_PORT`). Es el mismo para las dos
   máquinas: misma impresora, mismo usuario.
4. Abre PowerShell en esa carpeta y prueba:

   ```powershell
   npm run prueba
   ```

   Debe salir la página que dice "Prueba de impresion". Si no sale, el problema
   es de red o de IP, no del sistema — ver `tools/print-agent/README.md`.

5. Déjalo permanente: **doble clic en `INSTALAR.cmd`**.

   Ese archivo existe justo para esto. Una máquina recién puesta se topa con
   dos muros —la política de scripts de PowerShell, y la marca de "vino de
   internet" que Windows le pone a todo lo que llega en una USB o un ZIP, la
   que hace que diga que el script no está firmado— y los resuelve los dos
   solo.

Al terminar quedan dos cosas: el agente **arranca solo al prender la
computadora**, y en el escritorio hay un ícono **"Impresora Turkana"** con el
logo. Ese ícono es el único que el personal necesita conocer: si alguien cierra
la ventana por error, doble clic y vuelve a andar.

### 3.2 El punto de venta como aplicación

Para que no sea "una pestaña más del navegador":

1. Abre `https://turkanajewerly.com/pos` en Edge o Chrome.
2. Menú `…` → **Aplicaciones → Instalar este sitio como una aplicación**.
   Ponle *Turkana POS*.
3. Marca "Anclar a la barra de tareas" y "Crear acceso directo en el
   escritorio". Toma solo el logo de Turkana como ícono.

Queda una ventana limpia, sin barra de direcciones, que abre directo en el POS.

### 3.3 Primer arranque

1. Abre Turkana POS y entra con el número de empleado.
2. Sale la pregunta **¿Cuál caja es este equipo?** → elige **Caja Principal**.
   Se pregunta una sola vez.
3. Comprueba arriba, junto al nombre: la pastilla de la impresora en **verde**.
4. Abre la caja con su fondo inicial, cobra algo de prueba y confirma que el
   ticket sale solo. Cancela esa venta desde Admin → Ventas si no era real.

---

## 4. El iPad

1. Abre `https://turkanajewerly.com/pos` en **Safari**.
2. Botón de compartir → **Añadir a pantalla de inicio**. Ponle *Turkana POS*.
   Queda con el logo, a pantalla completa y con el modo sin conexión activo
   (eso último sólo funciona desde el ícono de la pantalla de inicio, no desde
   la pestaña de Safari).
3. Entra con el número de empleado del cajero que lo vaya a usar.
4. En **¿Cuál caja es este equipo?** elige **Caja iPad**. Nunca la misma que la
   computadora: compartirían fondo y corte.
5. Cobra algo de prueba: el ticket sale en la impresora del mostrador. Es lo
   normal, hay una sola impresora.

No hace falta instalar nada en el iPad. Sólo necesita que la computadora del
mostrador esté encendida para que salgan sus tickets.

---

## 5. Lo que hay que explicarle al personal

Todo lo demás ya está en `docs/manual-de-uso.md`. Para el día de la entrega,
tres cosas:

- **Cada equipo tiene su caja.** Dos fondos, dos cortes, dos correos. El dinero
  de uno nunca se mezcla con el del otro.
- **El ticket sale solo.** Si aparece la ventana de impresión del navegador es
  que algo pasa con la impresora — no está roto, es el respaldo.
- **El ícono "Impresora Turkana" del escritorio.** Si la pastilla del POS se
  pone ámbar y la impresora está encendida y con papel, doble clic ahí.

---

## 6. Comprobación final

- [ ] `https://turkanajewerly.com/pos` abre desde la computadora y desde el iPad.
- [ ] Los dos equipos tienen su caja elegida y distinta.
- [ ] Se pueden abrir los **dos turnos a la vez**, cada uno con su fondo.
- [ ] Pastilla de impresora en verde en los dos.
- [ ] Una venta desde cada equipo imprime su ticket sin ventana de impresión.
- [ ] Un corte de prueba imprime y llega su correo.
- [ ] Se reinicia la computadora y el agente vuelve solo (pastilla en verde sin
      que nadie toque nada).
