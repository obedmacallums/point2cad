# Autenticación con Google y control de usuarios (Supabase) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir login con Google y un control de usuarios (activo/inactivo + conteo de inicios de sesión) respaldado por Supabase, dejando la app actual intacta detrás de una compuerta de acceso.

**Architecture:** App estática React+Vite (GitHub Pages, sin backend). Un `AuthProvider` gestiona la sesión de Supabase y carga el perfil del usuario; un `AuthGate` decide entre login / app / acceso denegado según `is_active`. La fuente de verdad (estado y contador) vive en Postgres con RLS; el chequeo en el cliente es la compuerta visual. Veredicto de acceso = `is_active` (sin lógica temporal).

**Tech Stack:** React 18, Vite 5, `@supabase/supabase-js`, Postgres/RLS (Supabase), Vitest + React Testing Library (nuevo runner de tests JS).

**Spec:** `docs/superpowers/specs/2026-06-04-autenticacion-google-supabase-design.md`

---

## Estructura de archivos

**Nuevos:**
- `src/lib/authStatus.js` — función pura `deriveAuthStatus` (mapeo estado crudo → estado de UI).
- `src/lib/authStatus.test.js` — tests de la función pura.
- `src/lib/supabase.js` — instancia única del cliente Supabase.
- `src/context/AuthContext.jsx` — provider de sesión/perfil + acciones (`signInWithGoogle`, `signOut`, `retry`).
- `src/context/AuthContext.test.jsx` — tests del provider con Supabase mockeado.
- `src/components/AuthGate/AuthGate.jsx` — enrutado por `status`.
- `src/components/AuthGate/AuthGate.test.jsx` — tests de la compuerta.
- `src/components/AuthGate/LoginScreen.jsx` — pantalla de login.
- `src/components/AuthGate/AccessDeniedScreen.jsx` — pantalla de acceso desactivado.
- `src/test/setup.js` — setup de Vitest (matchers + cleanup).
- `supabase/migrations/0001_auth_profiles.sql` — tabla, trigger, RPC y RLS.
- `.env.example` — plantilla de variables.

**Modificados:**
- `package.json` — dependencias y scripts de test.
- `vite.config.js` — bloque `test` de Vitest.
- `src/main.jsx` — envolver la app con `AuthProvider` + `AuthGate`.
- `.gitignore` — ignorar `.env`.
- `.github/workflows/deploy.yml` — inyectar secrets de Supabase en el build.

---

## Task 1: Tooling de tests + función pura `deriveAuthStatus`

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Create: `src/test/setup.js`
- Create: `src/lib/authStatus.js`
- Test: `src/lib/authStatus.test.js`

- [ ] **Step 1: Instalar dependencias**

```bash
npm install @supabase/supabase-js
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Añadir scripts de test a `package.json`**

En la sección `"scripts"` deja:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 3: Configurar Vitest en `vite.config.js`**

Añade el bloque `test` dentro del objeto que recibe `defineConfig` (junto a `base`, `server`):

```js
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
```

- [ ] **Step 4: Crear el setup de Vitest**

Crea `src/test/setup.js`:

```js
import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
```

- [ ] **Step 5: Escribir el test que falla**

Crea `src/lib/authStatus.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { deriveAuthStatus } from './authStatus'

describe('deriveAuthStatus', () => {
  it('devuelve loading mientras inicializa', () => {
    expect(deriveAuthStatus({ initializing: true })).toBe('loading')
  })

  it('devuelve signedOut sin sesión', () => {
    expect(
      deriveAuthStatus({ initializing: false, session: null }),
    ).toBe('signedOut')
  })

  it('devuelve error si falló la carga del perfil', () => {
    expect(
      deriveAuthStatus({
        initializing: false,
        session: { user: { id: 'u1' } },
        profile: null,
        profileError: { message: 'boom' },
      }),
    ).toBe('error')
  })

  it('devuelve loading si hay sesión pero el perfil aún no cargó', () => {
    expect(
      deriveAuthStatus({
        initializing: false,
        session: { user: { id: 'u1' } },
        profile: null,
        profileError: null,
      }),
    ).toBe('loading')
  })

  it('devuelve allowed si el perfil está activo', () => {
    expect(
      deriveAuthStatus({
        initializing: false,
        session: { user: { id: 'u1' } },
        profile: { is_active: true },
      }),
    ).toBe('allowed')
  })

  it('devuelve denied si el perfil está inactivo', () => {
    expect(
      deriveAuthStatus({
        initializing: false,
        session: { user: { id: 'u1' } },
        profile: { is_active: false },
      }),
    ).toBe('denied')
  })
})
```

- [ ] **Step 6: Ejecutar el test y verificar que falla**

Run: `npm test -- authStatus`
Expected: FAIL — `Failed to resolve import './authStatus'` (el módulo aún no existe).

- [ ] **Step 7: Implementar `deriveAuthStatus`**

Crea `src/lib/authStatus.js`:

```js
// Mapea el estado crudo de autenticación al estado de UI que consume AuthGate.
// status ∈ 'loading' | 'signedOut' | 'allowed' | 'denied' | 'error'
export function deriveAuthStatus({ initializing, session, profile, profileError }) {
  if (initializing) return 'loading'
  if (!session) return 'signedOut'
  if (profileError) return 'error'
  if (!profile) return 'loading'
  return profile.is_active ? 'allowed' : 'denied'
}
```

- [ ] **Step 8: Ejecutar el test y verificar que pasa**

Run: `npm test -- authStatus`
Expected: PASS (6 tests).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vite.config.js src/test/setup.js src/lib/authStatus.js src/lib/authStatus.test.js
git commit -m "feat: add vitest tooling and deriveAuthStatus helper"
```

---

## Task 2: Migración SQL de Supabase (tabla, trigger, RPC, RLS)

Esta tarea versiona el SQL y lo aplica en Supabase. No tiene test automatizado en el repo; la verificación es manual en el dashboard.

**Files:**
- Create: `supabase/migrations/0001_auth_profiles.sql`

- [ ] **Step 1: Crear el archivo de migración**

Crea `supabase/migrations/0001_auth_profiles.sql`:

```sql
-- Tabla de perfiles: una fila por usuario autenticado.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  is_active boolean not null default true,
  login_count integer not null default 0,
  last_login_at timestamptz
);

alter table public.profiles enable row level security;

-- Cada usuario puede leer SOLO su propia fila.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- (No se crean políticas de insert/update/delete: el cliente no puede escribir.)

-- Trigger de alta: crea el perfil al registrarse en auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RPC para registrar un inicio de sesión. security definer => ignora RLS,
-- de modo que el usuario no puede manipular su contador con un update directo.
create or replace function public.record_login()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
     set login_count = login_count + 1,
         last_login_at = now()
   where id = auth.uid();
end;
$$;

grant execute on function public.record_login() to authenticated;
```

- [ ] **Step 2: Aplicar el SQL en Supabase**

1. Crea (o abre) el proyecto en https://supabase.com.
2. Ve a **SQL Editor → New query**, pega el contenido de `supabase/migrations/0001_auth_profiles.sql` y ejecútalo.
3. Verifica en **Table Editor** que existe la tabla `profiles` con las columnas esperadas y que muestra el candado de RLS activo.

- [ ] **Step 3: Configurar Google OAuth**

1. En **Google Cloud Console** crea credenciales **OAuth 2.0 Client ID** (tipo "Web application"). Copia *Client ID* y *Client secret*.
2. En **Supabase → Authentication → Providers → Google**: habilítalo y pega Client ID/secret.
3. En **Supabase → Authentication → URL Configuration**, en *Redirect URLs* añade:
   - `http://localhost:5173` (desarrollo)
   - `https://<usuario>.github.io/<repo>/` (producción GitHub Pages)
4. En Google Cloud, en *Authorized redirect URIs* del cliente OAuth añade la URL de callback de Supabase que el panel de Google provider muestra (formato `https://<project-ref>.supabase.co/auth/v1/callback`).

- [ ] **Step 4: Verificación manual del backend**

Tras integrar el frontend (Tasks 3–6) y hacer un primer login real, confirma en **Table Editor → profiles**:
- Aparece una fila para tu usuario con `is_active = true` y `login_count ≥ 1`.
- Al volver a iniciar sesión, `login_count` aumenta y `last_login_at` se actualiza.
- Al poner `is_active = false` desde el editor y recargar la app, queda bloqueado.

(Estos pasos quedan documentados aquí; se ejecutan al llegar a Task 6.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_auth_profiles.sql
git commit -m "feat: add Supabase schema for profiles, login trigger and RPC"
```

---

## Task 3: Cliente Supabase y variables de entorno

**Files:**
- Create: `src/lib/supabase.js`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Crear el módulo del cliente**

Crea `src/lib/supabase.js`:

```js
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // No es secreto: la anon key es pública por diseño. Solo avisamos si falta.
  console.warn('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
```

- [ ] **Step 2: Crear `.env.example`**

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 3: Crear tu `.env` local (no se versiona)**

Crea `.env` con los valores reales de tu proyecto (los encuentras en **Supabase → Project Settings → API**):

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-real>
```

- [ ] **Step 4: Ignorar `.env` en git**

Añade al final de `.gitignore`:

```text
# Variables de entorno locales
.env
```

- [ ] **Step 5: Verificar que el build resuelve el módulo**

Run: `npm run build`
Expected: build correcto, sin errores de import de `@supabase/supabase-js`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase.js .env.example .gitignore
git commit -m "feat: add Supabase client and env config"
```

---

## Task 4: AuthContext (provider de sesión y perfil)

**Files:**
- Create: `src/context/AuthContext.jsx`
- Test: `src/context/AuthContext.test.jsx`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/context/AuthContext.test.jsx`:

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { supabase, singleMock } from '../lib/supabase'

// Mock del cliente Supabase. `singleMock` controla la respuesta del perfil.
vi.mock('../lib/supabase', () => {
  const singleMock = vi.fn()
  return {
    singleMock,
    supabase: {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
        signInWithOAuth: vi.fn(),
        signOut: vi.fn(),
      },
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ single: singleMock }) }),
      })),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  }
})

function StatusProbe() {
  const { status } = useAuth()
  return <div data-testid="status">{status}</div>
}

function renderProvider() {
  return render(
    <AuthProvider>
      <StatusProbe />
    </AuthProvider>,
  )
}

const session = { user: { id: 'u1' } }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AuthProvider', () => {
  it('queda en signedOut cuando no hay sesión', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('signedOut'),
    )
  })

  it('queda en allowed con perfil activo', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session } })
    singleMock.mockResolvedValue({ data: { is_active: true }, error: null })
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('allowed'),
    )
  })

  it('queda en denied con perfil inactivo', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session } })
    singleMock.mockResolvedValue({ data: { is_active: false }, error: null })
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('denied'),
    )
  })

  it('queda en error si la carga del perfil falla', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session } })
    singleMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('error'),
    )
  })
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- AuthContext`
Expected: FAIL — `Failed to resolve import './AuthContext'`.

- [ ] **Step 3: Implementar el provider**

Crea `src/context/AuthContext.jsx`:

```jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { deriveAuthStatus } from '../lib/authStatus'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [initializing, setInitializing] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)
  const recordedFor = useRef(null)

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) {
      setProfileError(error)
      setProfile(null)
    } else {
      setProfileError(null)
      setProfile(data)
    }
  }

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const s = data.session
      setSession(s)
      if (s) {
        loadProfile(s.user.id).finally(() => {
          if (active) setInitializing(false)
        })
      } else {
        setInitializing(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setProfileError(null)
        recordedFor.current = null
        return
      }
      // Registrar el login una sola vez por sesión nueva (evento SIGNED_IN
      // tras el redirect), no en refrescos de token ni recargas.
      if (event === 'SIGNED_IN' && recordedFor.current !== s.user.id) {
        recordedFor.current = s.user.id
        supabase.rpc('record_login').then(() => loadProfile(s.user.id))
      } else {
        loadProfile(s.user.id)
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = {
    session,
    profile,
    status: deriveAuthStatus({ initializing, session, profile, profileError }),
    signInWithGoogle: () =>
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + import.meta.env.BASE_URL,
        },
      }),
    signOut: () => supabase.auth.signOut(),
    retry: () => {
      if (session) loadProfile(session.user.id)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npm test -- AuthContext`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/context/AuthContext.jsx src/context/AuthContext.test.jsx
git commit -m "feat: add AuthContext provider with profile loading and login tracking"
```

---

## Task 5: AuthGate y pantallas (login / acceso denegado)

**Files:**
- Create: `src/components/AuthGate/AuthGate.jsx`
- Create: `src/components/AuthGate/LoginScreen.jsx`
- Create: `src/components/AuthGate/AccessDeniedScreen.jsx`
- Test: `src/components/AuthGate/AuthGate.test.jsx`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/components/AuthGate/AuthGate.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AuthGate from './AuthGate'
import { useAuth } from '../../context/AuthContext'

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
})

function setup(authValue) {
  useAuth.mockReturnValue(authValue)
  return render(
    <AuthGate>
      <div>APP CONTENT</div>
    </AuthGate>,
  )
}

describe('AuthGate', () => {
  it('muestra los hijos cuando el acceso está permitido', () => {
    setup({ status: 'allowed' })
    expect(screen.getByText('APP CONTENT')).toBeInTheDocument()
  })

  it('muestra el login cuando no hay sesión', () => {
    setup({ status: 'signedOut', signInWithGoogle: vi.fn() })
    expect(screen.getByRole('button', { name: /entrar con google/i })).toBeInTheDocument()
    expect(screen.queryByText('APP CONTENT')).not.toBeInTheDocument()
  })

  it('muestra acceso desactivado cuando está denegado', () => {
    setup({ status: 'denied', signOut: vi.fn() })
    expect(screen.getByText(/acceso desactivado/i)).toBeInTheDocument()
    expect(screen.queryByText('APP CONTENT')).not.toBeInTheDocument()
  })

  it('muestra reintentar en estado de error', () => {
    setup({ status: 'error', retry: vi.fn() })
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- AuthGate`
Expected: FAIL — `Failed to resolve import './AuthGate'`.

- [ ] **Step 3: Crear `LoginScreen`**

Crea `src/components/AuthGate/LoginScreen.jsx`:

```jsx
import { useAuth } from '../../context/AuthContext'

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth()
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gray-950 text-gray-100">
      <h1 className="text-2xl font-semibold">Point2CAD</h1>
      <p className="text-gray-400">Inicia sesión para continuar</p>
      <button
        onClick={signInWithGoogle}
        className="rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-500"
      >
        Entrar con Google
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Crear `AccessDeniedScreen`**

Crea `src/components/AuthGate/AccessDeniedScreen.jsx`:

```jsx
import { useAuth } from '../../context/AuthContext'

export default function AccessDeniedScreen() {
  const { signOut } = useAuth()
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gray-950 text-gray-100">
      <h1 className="text-xl font-semibold">Acceso desactivado</h1>
      <p className="max-w-sm text-center text-gray-400">
        Tu cuenta no está activa. Contacta al administrador para que habilite tu acceso.
      </p>
      <button
        onClick={signOut}
        className="rounded-md border border-gray-600 px-5 py-2.5 font-medium text-gray-200 hover:bg-gray-800"
      >
        Cerrar sesión
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Crear `AuthGate`**

Crea `src/components/AuthGate/AuthGate.jsx`:

```jsx
import { useAuth } from '../../context/AuthContext'
import LoginScreen from './LoginScreen'
import AccessDeniedScreen from './AccessDeniedScreen'

function FullScreen({ children }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-gray-950 text-gray-100">
      {children}
    </div>
  )
}

export default function AuthGate({ children }) {
  const { status, retry } = useAuth()

  if (status === 'loading') {
    return (
      <FullScreen>
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
        <p className="text-gray-400">Verificando acceso…</p>
      </FullScreen>
    )
  }

  if (status === 'signedOut') return <LoginScreen />
  if (status === 'denied') return <AccessDeniedScreen />

  if (status === 'error') {
    return (
      <FullScreen>
        <p className="text-gray-300">No se pudo verificar tu acceso.</p>
        <button
          onClick={retry}
          className="rounded-md bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-500"
        >
          Reintentar
        </button>
      </FullScreen>
    )
  }

  return children
}
```

- [ ] **Step 6: Ejecutar el test y verificar que pasa**

Run: `npm test -- AuthGate`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/AuthGate/
git commit -m "feat: add AuthGate and login/access-denied screens"
```

---

## Task 6: Integrar la compuerta en `main.jsx` + verificación manual end-to-end

**Files:**
- Modify: `src/main.jsx`

- [ ] **Step 1: Envolver la app con `AuthProvider` + `AuthGate`**

Reemplaza el contenido completo de `src/main.jsx` por:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PyodideProvider } from './context/PyodideContext'
import { AppProvider } from './context/AppContext'
import { AuthProvider } from './context/AuthContext'
import AuthGate from './components/AuthGate/AuthGate'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <PyodideProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </PyodideProvider>
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)
```

(El `AuthGate` queda **fuera** de `PyodideProvider`, de modo que Pyodide solo se inicializa para usuarios con acceso permitido.)

- [ ] **Step 2: Verificar que el build sigue compilando**

Run: `npm run build`
Expected: build correcto.

- [ ] **Step 3: Verificación manual del riesgo COOP/COEP en dev**

Run: `npm run dev`

En el navegador (con la consola/red abierta):
1. Abre la app: debe mostrarse `LoginScreen`.
2. Pulsa "Entrar con Google" y completa el login (flujo por redirección).
3. Confirma en la pestaña **Network** que las llamadas a `…supabase.co` **no** son bloqueadas por COEP/CORP. Si aparece un error tipo `net::ERR_BLOCKED_BY_RESPONSE` o un fallo CORS/CORP:
   - Cambia en `vite.config.js` el header `'Cross-Origin-Embedder-Policy'` de `'require-corp'` a `'credentialless'` y reintenta.
   - Documenta el cambio en el commit.
4. Tras el login, la app debe renderizar tu UI actual (Pyodide carga).

- [ ] **Step 4: Verificación manual del backend (cierra Task 2, Step 4)**

En **Supabase → Table Editor → profiles**:
1. Confirma que existe tu fila con `is_active = true` y `login_count ≥ 1`.
2. Vuelve a iniciar sesión y confirma que `login_count` sube y `last_login_at` cambia.
3. Pon `is_active = false`, recarga la app: debe mostrarse `AccessDeniedScreen`.
4. Vuelve a poner `is_active = true`, recarga: debe entrar de nuevo.

- [ ] **Step 5: Commit**

```bash
git add src/main.jsx vite.config.js
git commit -m "feat: gate the app behind Google auth via AuthGate"
```

---

## Task 7: Inyectar secrets de Supabase en el deploy de GitHub Pages

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Añadir los secrets en GitHub**

En el repo: **Settings → Secrets and variables → Actions → New repository secret**, crea:
- `VITE_SUPABASE_URL` = la URL del proyecto Supabase.
- `VITE_SUPABASE_ANON_KEY` = la anon key del proyecto.

- [ ] **Step 2: Inyectar los secrets en el paso de build**

En `.github/workflows/deploy.yml`, en el paso `- name: Build`, amplía el bloque `env` para que quede así:

```yaml
      - name: Build
        run: npm run build
        env:
          # Vite usa este valor como `base` para que los assets carguen
          # correctamente en la URL https://<user>.github.io/<repo>/
          VITE_BASE_PATH: /${{ github.event.repository.name }}/
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

- [ ] **Step 3: Verificar el workflow localmente (sintaxis)**

Run: `npm run build`
Expected: build correcto (la inyección real ocurre en CI; este paso solo confirma que el proyecto compila).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: inject Supabase env vars into Pages build"
```

- [ ] **Step 5: Verificación post-deploy (tras merge a main)**

Cuando el workflow despliegue, abre `https://<usuario>.github.io/<repo>/`:
1. Aparece `LoginScreen`.
2. El login con Google funciona y entra a la app.
3. Confirma que la *redirect URL* de producción está en la lista de Supabase (Task 2, Step 3).

---

## Self-Review (cobertura del spec)

- **Login con Google** → Task 4 (`signInWithGoogle`), Task 5 (`LoginScreen`), Task 2 Step 3 (config OAuth). ✅
- **Activo por defecto** → Task 2 (`is_active boolean default true`, trigger). ✅
- **Activar/desactivar desde Supabase** → Task 2 (RLS sin update del cliente), Task 6 Step 4 (verificación). ✅
- **Conteo de inicios de sesión + último inicio** → Task 2 (`record_login`), Task 4 (llamada en `SIGNED_IN`). ✅
- **Veredicto = is_active, sin lógica temporal** → Task 1 (`deriveAuthStatus`). ✅
- **App actual intacta tras la compuerta** → Task 6 (`AuthGate` envolviendo `App`). ✅
- **Falla cerrado ante errores** → Task 1 (estado `error`), Task 5 (pantalla con reintentar). ✅
- **Riesgo COOP/COEP** → Task 6 Step 3 (verificación + mitigación `credentialless`). ✅
- **Secrets en GitHub Pages** → Task 7. ✅
- **Pruebas (mapeo puro + AuthContext mockeado + AuthGate)** → Tasks 1, 4, 5. ✅
- **Fuera de alcance (panel in-app, lógica de 5 días, edge functions)** → no se incluyen tareas. ✅
