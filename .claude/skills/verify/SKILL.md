# Verificar cambios en Point2CAD

SPA React + Vite, 100% client-side. No hay backend propio: Supabase solo para auth.

## Lanzar

```bash
npm install                      # si no hay node_modules
npx vite --port 5199 --strictPort
# → http://localhost:5199
```

No hay `.env` en el repo (solo `.env.example`). Sin `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
la sonda de salud considera Supabase caído y la app entra en modo abierto (sin login).
Para simular estados de Supabase, pasar las vars por línea de comandos:

```bash
# Supabase "pausado" (gateway 5xx) o "vivo" (200): servir un fake local
python3 fake_supabase.py 540 59901 &   # ver scratchpad; responde el status en /auth/v1/health con CORS
VITE_SUPABASE_URL=http://127.0.0.1:59901 VITE_SUPABASE_ANON_KEY=fake npx vite --port 5199 --strictPort

# Supabase inalcanzable: apuntar a un puerto muerto
VITE_SUPABASE_URL=http://127.0.0.1:59999 ...
```

## Flujos que valen la pena

- **Auth gate**: pausado/inalcanzable → app abierta directa; vivo (200) → LoginScreen
  "Entrar con Google". El bypass de dev requiere `VITE_DISABLE_AUTH=true` explícito.
- **Pipeline principal**: cargar `example.csv` desde la pantalla inicial → preview →
  detectar códigos → procesar (Pyodide se descarga de CDN la primera vez, tarda) →
  viewer 3D → exportar DXF.

## Gotchas

- El venv de tests Python vive en `.venv` (Python ≥3.10 obligatorio; el del sistema es 3.9).
- `supabase.js` hace `createClient(url, anonKey)` en import: si las vars faltan del todo
  en un build de producción, revisa que no explote antes de montar React.
