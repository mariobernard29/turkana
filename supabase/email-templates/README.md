# Correos de Supabase Auth — Turkana

Templates HTML con el estilo de Turkana para los correos que **envía Supabase**
(no la app): confirmación de cuenta y recuperación de contraseña.

## Archivos
- `confirmacion.html` → template **Confirm signup**
- `recuperacion.html` → template **Reset password**

## Cómo instalarlos
1. Entra a **Supabase → Authentication → Emails** (Email Templates).
2. Abre **Confirm signup**, pega el contenido de `confirmacion.html` en *Message body* y guarda.
3. Abre **Reset password**, pega el contenido de `recuperacion.html` en *Message body* y guarda.
4. (Opcional) Ajusta el *Subject*, por ejemplo:
   - Confirm signup: `Confirma tu cuenta de Turkana`
   - Reset password: `Restablece tu contraseña de Turkana`

## Requisitos para que los enlaces funcionen
Los enlaces apuntan a `/auth/confirm` (ruta ya creada en `apps/web/app/auth/confirm/route.ts`),
que valida el `token_hash` del lado servidor y crea la sesión en cookies (flujo SSR).

En **Supabase → Authentication → URL Configuration**:
- **Site URL**: la URL de producción (p. ej. `https://turkanajewerly.com`).
- **Redirect URLs**: agrega
  - `https://turkanajewerly.com/auth/confirm`
  - `https://turkanajewerly.com/actualizar-contrasena`
  - `http://localhost:3000/auth/confirm` y `http://localhost:3000/actualizar-contrasena` (para desarrollo)

También asegúrate de tener `NEXT_PUBLIC_SITE_URL` en `.env.local` apuntando a la URL correcta.

## Flujo
- **Confirmación de cuenta**: el correo lleva a `/auth/confirm?...&type=signup&next=/rewards`
  → se confirma y entra al panel de Rewards.
- **Recuperación**: el correo lleva a `/auth/confirm?...&type=recovery&next=/actualizar-contrasena`
  → el usuario define su nueva contraseña y luego inicia sesión.

> Nota: las variables `{{ .SiteURL }}` y `{{ .TokenHash }}` las rellena Supabase al enviar el correo.
