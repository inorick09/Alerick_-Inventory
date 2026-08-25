-- Ejecuta este script completo en Supabase: panel del proyecto > SQL Editor > New query > pega y dale "Run"

create extension if not exists "pgcrypto";

create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sku text,
  categoria text,
  cantidad numeric default 0,
  precio_venta numeric default 0,
  costo numeric default 0,
  created_at timestamptz default now()
);

-- Si la tabla productos ya existía antes de agregar la cantidad manual, ejecuta esta línea:
alter table productos add column if not exists cantidad numeric default 0;

create table if not exists compras (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references productos(id) on delete set null,
  nombre_producto text,
  sku text,
  cantidad numeric not null default 0,
  valor_unitario numeric not null default 0,
  valor_total numeric not null default 0,
  fecha date not null default current_date,
  quien_pago text,
  factura text,
  created_at timestamptz default now()
);

-- Si la tabla compras ya existía antes de agregar nombre_producto y sku, ejecuta estas líneas:
alter table compras add column if not exists nombre_producto text;
alter table compras add column if not exists sku text;

create table if not exists ventas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references productos(id) on delete set null,
  nombre_producto text,
  cantidad numeric not null default 0,
  precio_venta numeric not null default 0,
  valor_total numeric not null default 0,
  cliente text,
  fecha_entrega date default current_date,
  fecha_pago date,
  abono numeric default 0,
  saldo numeric default 0,
  metodo_pago text,
  created_at timestamptz default now()
);

-- Si la tabla ventas ya existía antes de agregar nombre_producto y fecha_pago, ejecuta estas líneas:
alter table ventas add column if not exists nombre_producto text;
alter table ventas add column if not exists fecha_pago date;

-- fecha_entrega ahora acepta valores vacíos (antes era NOT NULL, lo que forzaba
-- fechas placeholder tipo 0001-01-01 en registros importados sin fecha real):
alter table ventas alter column fecha_entrega drop not null;

create table if not exists pagos_pendientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  monto numeric not null default 0,
  factura text,
  fecha date not null default current_date,
  created_at timestamptz default now()
);

create table if not exists por_comprar (
  id uuid primary key default gen_random_uuid(),
  producto text not null,
  sku text,
  tono text,
  cantidad numeric default 0,
  cliente text,
  status text not null default 'Por comprar',
  created_at timestamptz default now()
);

-- Catálogo unificado de clientes. `ventas.cliente` y `por_comprar.cliente` siguen
-- siendo texto libre (para no romper la app ni datos existentes), pero un trigger
-- (ver más abajo) normaliza cada valor contra este catálogo antes de guardarlo:
-- si ya existe un cliente con ese nombre (sin importar mayúsculas/acentos/espacios),
-- reescribe el valor a la forma oficial; si es nuevo, lo registra aquí tal cual.
create extension if not exists "unaccent" with schema extensions;

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create or replace function fn_normalizar_cliente()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_input text;
  v_match text;
begin
  if new.cliente is null then
    return new;
  end if;

  v_input := regexp_replace(btrim(new.cliente), '\s+', ' ', 'g');

  if v_input = '' then
    new.cliente := null;
    return new;
  end if;

  select nombre into v_match
  from clientes
  where lower(unaccent(nombre)) = lower(unaccent(v_input))
  limit 1;

  if v_match is not null then
    new.cliente := v_match;
  else
    insert into clientes (nombre) values (v_input) on conflict (nombre) do nothing;
    new.cliente := v_input;
  end if;

  return new;
end;
$$;

revoke execute on function fn_normalizar_cliente() from public;
revoke execute on function fn_normalizar_cliente() from anon;
revoke execute on function fn_normalizar_cliente() from authenticated;

drop trigger if exists trg_normalizar_cliente_ventas on ventas;
create trigger trg_normalizar_cliente_ventas
  before insert or update of cliente on ventas
  for each row execute function fn_normalizar_cliente();

drop trigger if exists trg_normalizar_cliente_por_comprar on por_comprar;
create trigger trg_normalizar_cliente_por_comprar
  before insert or update of cliente on por_comprar
  for each row execute function fn_normalizar_cliente();

-- Habilita el acceso en tiempo real (para que ambos vean los cambios del otro al instante)
alter publication supabase_realtime add table productos;
alter publication supabase_realtime add table compras;
alter publication supabase_realtime add table ventas;
alter publication supabase_realtime add table pagos_pendientes;
alter publication supabase_realtime add table por_comprar;
alter publication supabase_realtime add table clientes;

-- Seguridad a nivel de fila (RLS): la app ahora exige inicio de sesión (Supabase Auth).
-- Solo usuarios autenticados (con cuenta creada en Authentication > Users) pueden leer o
-- escribir datos. La llave "anon" pública ya no basta por sí sola para acceder a los datos.

alter table productos enable row level security;
alter table compras enable row level security;
alter table ventas enable row level security;
alter table pagos_pendientes enable row level security;
alter table por_comprar enable row level security;

drop policy if exists "acceso total productos" on productos;
drop policy if exists "acceso total compras" on compras;
drop policy if exists "acceso total ventas" on ventas;
drop policy if exists "acceso total pagos_pendientes" on pagos_pendientes;

create policy "solo autenticados productos" on productos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo autenticados compras" on compras for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo autenticados ventas" on ventas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo autenticados pagos_pendientes" on pagos_pendientes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo autenticados por_comprar" on por_comprar for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter table clientes enable row level security;
drop policy if exists "solo autenticados clientes" on clientes;
create policy "solo autenticados clientes" on clientes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
