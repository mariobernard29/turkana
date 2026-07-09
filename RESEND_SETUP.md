# Configuración de correos (Resend + Hostinger + Supabase)

Guía para dejar funcionando los correos de **Turkana Jewelry**:
- **Avisos y confirmaciones de compra** (los envía la app vía Resend).
- **Confirmación de cuenta de Turkana Rewards** (los envía Supabase; se conecta a Resend por SMTP).

> ⚠️ Dominio: el dominio real comprado es **`turkanajewerly.com`** (así, con "jewerly") y el correo
> es **`contacto@turkanajewerly.com`**. Los registros DNS deben crearse en ESE dominio exactamente.

---

## Parte 1 — Crear la cuenta de Resend

1. Entra a <https://resend.com> → **Sign up** (puedes usar tu correo o GitHub/Google).
2. Confirma tu correo de registro.
3. Al entrar verás el **Dashboard**.

---

## Parte 2 — Agregar y verificar el dominio

1. En Resend: menú lateral **Domains** → **Add Domain**.
2. Escribe tu dominio: `turkanajewerly.com` (sin `www`, sin `https`).
3. Región: elige **US East (N. Virginia)** (o la más cercana; no importa mucho).
4. Resend te mostrará una lista de **registros DNS** que debes agregar. Serán del estilo:

   | Tipo | Nombre / Host | Valor | Notas |
   |------|---------------|-------|-------|
   | MX   | `send`        | `feedback-smtp.us-east-1.amazonses.com` (prioridad 10) | Para rebotes |
   | TXT  | `send`        | `v=spf1 include:amazonses.com ~all` | SPF del subdominio |
   | TXT  | `resend._domainkey` | `p=MIGfMA0GCSq...` (llave larga) | DKIM (firma) |
   | TXT  | `_dmarc`      | `v=DMARC1; p=none;` | DMARC (opcional pero recomendado) |

   **Copia los valores EXACTOS que te muestre tu panel de Resend** (la llave DKIM es única).

> 💡 Resend usa el subdominio **`send.`** para SPF y rebotes, por eso **no choca** con tu correo de
> Hostinger (que usa el dominio raíz). Puedes mantener `contacto@turkanajewerly.com` como remitente.

---

## Parte 3 — Agregar los registros en Hostinger (DNS)

1. Entra a **hPanel** de Hostinger → **Dominios** → elige `turkanajewerly.com`.
2. Abre **DNS / Nameservers** → **Zona DNS** (DNS Zone Editor).
3. Por cada registro que te dio Resend, haz **Agregar registro**:
   - **MX** → Tipo `MX`, Nombre `send`, Apunta a `feedback-smtp...amazonses.com`, Prioridad `10`.
   - **TXT (SPF de send)** → Tipo `TXT`, Nombre `send`, Contenido `v=spf1 include:amazonses.com ~all`.
   - **TXT (DKIM)** → Tipo `TXT`, Nombre `resend._domainkey`, Contenido = la llave `p=...` completa.
   - **TXT (DMARC)** → Tipo `TXT`, Nombre `_dmarc`, Contenido `v=DMARC1; p=none;` (si no existe ya).
4. **NO borres** tus registros actuales de Hostinger Mail:
   - El `MX` del dominio raíz que apunta a `mx1.hostinger.com` / `mx2.hostinger.com` (tu buzón).
   - El `TXT` SPF del dominio raíz de Hostinger (`v=spf1 include:_spf.mail.hostinger.com ~all`).
   - Los DKIM de Hostinger (`hostingermail-*._domainkey`).
   Resend convive con ellos porque usa el subdominio `send`.
5. Guarda. La propagación DNS tarda de **minutos hasta ~24 h** (normalmente < 1 h).
6. Vuelve a Resend → **Domains** → tu dominio → **Verify DNS Records** hasta que todos queden en
   **Verified** (verde).

---

## Parte 4 — Crear la API Key y conectarla a la app

1. En Resend: **API Keys** → **Create API Key**.
   - Nombre: `turkana-produccion`. Permiso: **Sending access**.
2. Copia la clave (`re_...`) — solo se muestra una vez.
3. En el proyecto, edita `apps/web/.env.local`:
   ```bash
   RESEND_API_KEY=re_tu_clave_aqui
   EMAIL_FROM="Turkana Jewelry <contacto@turkanajewerly.com>"
   ```
4. Reinicia el dev server (`Ctrl+C` → `npm run dev`). En Vercel (producción), agrega estas dos
   variables en **Project Settings → Environment Variables**.

Con esto ya funcionan los correos que envía la **app**:
- Avisos y estados de pedido (compra realizada, pago confirmado, preparado, enviado).
- Los **cupones de Turkana Rewards** (panel Admin → Rewards → "Enviar a miembros").

---

## Parte 5 — Confirmación de cuenta de Rewards (Supabase por SMTP)

Los correos de **confirmar cuenta** al registrarse en Rewards los envía **Supabase**, no la app.
Por defecto Supabase usa un servicio propio muy limitado. Conéctalo a Resend por **SMTP** para que
lleguen bien y con tu dominio:

1. En Resend, las credenciales SMTP son:
   - **Host:** `smtp.resend.com`
   - **Puerto:** `465` (SSL) — o `587` (TLS)
   - **Usuario:** `resend`
   - **Contraseña:** una **API Key** de Resend (usa la misma o crea otra).
2. En **Supabase** → tu proyecto → **Authentication → Emails → SMTP Settings** (o **Project
   Settings → Authentication → SMTP**):
   - Activa **Enable Custom SMTP**.
   - **Sender email:** `contacto@turkanajewerly.com`
   - **Sender name:** `Turkana Jewelry`
   - **Host:** `smtp.resend.com` · **Port:** `465` · **User:** `resend` · **Password:** tu API key.
   - Guarda.
3. En **Authentication → URL Configuration**:
   - **Site URL:** tu dominio de producción (ej. `https://turkanajewerly.com`) — en local usa
     `http://localhost:3000`.
   - Agrega esa URL en **Redirect URLs** también.
4. (Opcional) En **Authentication → Emails → Templates** personaliza el correo de "Confirm signup"
   con textos de Turkana.

> Mientras pruebas sin SMTP: en Supabase → Authentication → Users puedes crear un usuario con
> **Auto Confirm** activado para saltarte el correo.

---

## Parte 6 — Probar

1. **App (Resend):** desde el admin, abre un pedido y usa un botón de correo (o Rewards → enviar
   cupón). Revisa en **Resend → Logs** que salga como *Delivered*.
2. **Supabase (SMTP):** regístrate en `/rewards/acceso` con un correo real; debe llegar el correo de
   confirmación desde `contacto@turkanajewerly.com`.
3. Si un correo no llega: revisa **Resend → Logs** (motivo del fallo) y que el dominio esté
   **Verified**. El primer correo a una dirección puede caer en **Spam/Promociones** al inicio.

---

## Resumen de valores

| Dónde | Clave | Valor |
|-------|-------|-------|
| `.env.local` / Vercel | `RESEND_API_KEY` | `re_...` |
| `.env.local` / Vercel | `EMAIL_FROM` | `Turkana Jewelry <contacto@turkanajewerly.com>` |
| Supabase SMTP | Host / Port | `smtp.resend.com` / `465` |
| Supabase SMTP | User / Pass | `resend` / (una API key `re_...`) |
| Supabase SMTP | Sender | `contacto@turkanajewerly.com` · "Turkana Jewelry" |

**Plan gratis de Resend:** 100 correos/día · 3,000/mes (suficiente para empezar).
