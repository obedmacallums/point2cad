# Autenticación con Google y control de usuarios (Supabase)

**Fecha:** 2026-06-04
**Estado:** Aprobado (pendiente de plan de implementación)

## Objetivo

Añadir autenticación con Google a Point2CAD (app estática React + Vite + Pyodide
desplegada en GitHub Pages, sin backend propio) y un control de usuarios
respaldado por una base de datos en Supabase. Requisitos:

- Login con Google.
- Los usuarios quedan **activos por defecto** en su primer inicio de sesión.
- El administrador puede **activar/desactivar** usuarios desde el dashboard de
  Supabase (sin panel in-app).
- Registrar **cuántas veces** ha iniciado sesión cada usuario y la **fecha del
  último inicio**, visibles en la tabla de Supabase.

## Decisiones y alcance

- **Modelo de amenaza aceptado:** la app hace todo el trabajo en el navegador, no
  hay recurso de servidor que negar. El bloqueo es una compuerta en el cliente:
  la *fuente de verdad* (estado activo, contador) vive en Postgres y no se puede
  falsificar, pero un usuario técnico podría evadir el chequeo visual ejecutando
  el bundle localmente. Se acepta este riesgo a cambio de simplicidad y de no
  mover el hosting.
- **BaaS:** Supabase (Auth con proveedor Google + Postgres + RLS).
- **Administración:** directa en el dashboard de Supabase. No se construye panel
  de administración in-app ni rol de admin dentro de la aplicación.
- **Veredicto de acceso:** simplemente `is_active`. No hay lógica temporal (se
  descartó un modelo previo de prueba de 5 días).

## Arquitectura y flujo

```
1. Sin sesión → AuthGate muestra "Entrar con Google".
2. signInWithOAuth({ provider: 'google' })  [flujo por REDIRECCIÓN, no popup]
3. Vuelve con sesión → AuthGate lee el perfil propio del usuario.
4. Al detectar un login NUEVO (evento SIGNED_IN tras el redirect), la app llama a
   la RPC record_login() → incrementa login_count y fija last_login_at = now()
   (hora del servidor).
5. Veredicto = is_active:
     - true   → renderiza la app actual, intacta.
     - false  → pantalla "Acceso desactivado. Contacta al administrador." +
                cerrar sesión.
   Error de red/Supabase → falla cerrado (no concede acceso, ofrece reintentar).
```

**Flujo por redirección (no popup):** decisión deliberada. La app activa
cabeceras `COOP: same-origin` y `COEP: require-corp` para Pyodide
(SharedArrayBuffer); los popups de OAuth se rompen bajo `COOP: same-origin`. La
redirección evita ese problema.

**Auto-aprovisionamiento:** la fila en `profiles` se crea sola mediante un
*trigger* de Postgres sobre `auth.users` en el primer login (patrón estándar de
Supabase).

## Modelo de datos en Supabase

### Tabla `profiles`

| columna         | tipo        | notas                                   |
|-----------------|-------------|-----------------------------------------|
| `id`            | uuid PK     | referencia a `auth.users(id)`           |
| `email`         | text        | copiado en el alta                      |
| `created_at`    | timestamptz | `default now()`                         |
| `is_active`     | boolean     | `default true` — **activo por defecto** |
| `login_count`   | integer     | `default 0`                             |
| `last_login_at` | timestamptz | se actualiza en cada login              |

### Trigger de alta `handle_new_user`

Al insertarse una fila en `auth.users`, crea la fila correspondiente en
`profiles` con `email`, `is_active = true`, `login_count = 0`.

### RPC `record_login()` (`security definer`)

Para `auth.uid()`: `login_count = login_count + 1` y `last_login_at = now()`.
Va por RPC (no por update directo del cliente) para que el usuario no pueda
manipular su contador ni reactivarse a sí mismo.

**Nota sobre el contador:** se invoca al detectar un inicio de sesión nuevo
(evento `SIGNED_IN` tras el redirect), no en refrescos de token ni recargas de
página. Puede haber algún conteo de más en casos borde, pero no de menos; se
documenta el comportamiento.

### RLS en `profiles`

- El usuario puede **leer solo su propia fila** (`auth.uid() = id`), para que la
  app conozca su `is_active`.
- **No** puede insertar/actualizar/borrar desde el cliente. Los cambios de
  `is_active` los hace el administrador en el dashboard (rol service, que ignora
  RLS). El alta la hace el trigger; el contador lo actualiza la RPC
  `security definer`.

## Piezas de React

Archivos nuevos, siguiendo la estructura `src/` existente:

- **`src/lib/supabase.js`** — inicializa el cliente con `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY`. Una sola instancia exportada.
- **`src/context/AuthContext.jsx`** — provider que:
  - Se suscribe a `supabase.auth.onAuthStateChange`.
  - Mantiene `{ session, profile, status }` con
    `status ∈ { loading, signedOut, allowed, denied, error }`.
  - Al detectar un `SIGNED_IN` nuevo → llama a `record_login()` y luego lee el
    perfil propio.
  - Expone `signInWithGoogle()` y `signOut()`.
- **`src/components/AuthGate/AuthGate.jsx`** — enruta por `status`:
  - `loading` → spinner.
  - `signedOut` → `<LoginScreen/>`.
  - `denied` → `<AccessDeniedScreen/>`.
  - `error` → mensaje + botón reintentar (falla cerrado).
  - `allowed` → `children` (la app actual).
- **`src/components/AuthGate/LoginScreen.jsx`** — botón "Entrar con Google".
- **`src/components/AuthGate/AccessDeniedScreen.jsx`** — mensaje de acceso
  desactivado + cerrar sesión.

**Conexión** en `App.jsx` (o `main.jsx`), envolviendo lo existente sin tocarlo:

```jsx
<AuthProvider>
  <AuthGate>
    {/* toda la app actual, sin cambios */}
  </AuthGate>
</AuthProvider>
```

## Configuración, despliegue y riesgos

### Google OAuth (una vez)

1. Google Cloud Console: crear credenciales OAuth (Client ID + secret).
2. Supabase → Authentication → Providers → Google: pegar Client ID/secret.
3. Supabase → Authentication → URL Configuration: añadir la URL de GitHub Pages
   como *redirect URL* permitida y `http://localhost:5173` para desarrollo.

### Secrets y build

- Local: `.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. La anon key
  es pública por diseño; no es un secreto que proteger.
- GitHub Pages: añadir esas dos variables como *secrets* del repositorio e
  inyectarlas en el workflow `deploy.yml` en el paso de build (Vite las incrusta
  como variables `VITE_*`).

### Riesgo técnico a verificar temprano (COOP/COEP)

- El dev server fija `COOP: same-origin` y `COEP: require-corp` para Pyodide.
  Con `COEP: require-corp`, los `fetch` cross-origin a Supabase pueden bloquearse
  si las respuestas no traen cabecera CORP.
- **Plan:** validar al inicio del desarrollo que las llamadas a Supabase
  funcionan bajo esas cabeceras en dev. Si fallan, evaluar el modo CORS del SDK o
  `COEP: credentialless`. En producción GitHub Pages no fija cabeceras
  personalizadas, así que el problema, de existir, es solo en dev. Es el primer
  paso de integración del plan.

## Pruebas

- Test unitario de la función pura que mapea `(is_active, error)` → `status` de
  la compuerta.
- Tests del `AuthContext` con el cliente Supabase mockeado: sign-in correcto,
  usuario `denied`, estado de `error`.
- Verificación manual documentada en Supabase: un usuario nuevo aparece activo;
  desactivarlo (`is_active = false`) lo bloquea en el siguiente chequeo; el
  contador y `last_login_at` se actualizan al iniciar sesión.

## Fuera de alcance (YAGNI)

- Panel de administración in-app y rol de admin dentro de la aplicación.
- Lógica de prueba temporal (los 5 días del modelo descartado).
- Edge Functions / capacidades firmadas.
- Mover el hosting fuera de GitHub Pages o poner un proxy de acceso.
