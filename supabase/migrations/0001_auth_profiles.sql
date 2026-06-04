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
