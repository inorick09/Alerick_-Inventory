-- Ejecuta este script completo en Supabase: panel del proyecto > SQL Editor > New query > pega y dale "Run"

create extension if not exists "pgcrypto";

create table if not exists productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sku text,
  cantidad numeric default 0,
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

-- `ventas.abono` quedó redundante una vez que el historial de abonos vive
-- en `abonos_venta` (una clienta puede abonar en varias fechas distintas;
-- cada fila de abonos_venta es un pago parcial). El total abonado de cada
-- venta ahora se calcula al vuelo (en la app, sumando abonos_venta; aquí en
-- la base, dentro de los triggers de más abajo) en vez de guardarse en una
-- columna aparte que había que mantener sincronizada. Seguro de re-correr.
alter table ventas drop column if exists abono;

-- Historial de abonos por venta: una clienta puede abonar en varias fechas
-- distintas. Cada fila es un pago parcial; `ventas.saldo` y
-- `ventas.fecha_pago` dejan de editarse a mano y pasan a calcularse solos
-- (ver triggers más abajo) a partir de estos registros. `fecha_pago` queda
-- como la fecha del abono que hizo que el saldo llegara a 0 (o null si aún
-- debe algo). Todo este bloque es seguro de volver a correr.
create table if not exists abonos_venta (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id) on delete cascade,
  fecha date not null default current_date,
  monto numeric not null default 0,
  metodo_pago text,
  created_at timestamptz default now()
);

alter table abonos_venta enable row level security;
drop policy if exists "solo autenticados abonos_venta" on abonos_venta;
create policy "solo autenticados abonos_venta" on abonos_venta
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'abonos_venta'
  ) then
    alter publication supabase_realtime add table abonos_venta;
  end if;
end $$;

-- Recalcula saldo/fecha_pago de TODAS las ventas a partir de abonos_venta,
-- para que queden consistentes con la regla de los triggers de más abajo
-- (fecha_pago solo tiene fecha cuando el saldo ya es 0) incluso en datos
-- históricos. Seguro de volver a correr.
with totales as (
  select venta_id, coalesce(sum(monto), 0) as abono_total, max(fecha) as ultima_fecha
  from abonos_venta
  group by venta_id
)
update ventas v
set saldo = greatest(coalesce(v.valor_total, 0) - t.abono_total, 0),
    fecha_pago = case when t.abono_total >= coalesce(v.valor_total, 0) and coalesce(v.valor_total, 0) > 0 then t.ultima_fecha else null end
from totales t
where v.id = t.venta_id;

update ventas
set saldo = coalesce(valor_total, 0), fecha_pago = null
where id not in (select venta_id from abonos_venta);

-- Trigger: cada vez que se inserta, edita o borra un abono, recalcula
-- saldo/fecha_pago de esa venta automáticamente.
create or replace function fn_recalcular_venta_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta_id uuid;
  v_total_abonado numeric;
  v_valor_total numeric;
  v_ultima_fecha date;
begin
  v_venta_id := coalesce(new.venta_id, old.venta_id);

  select coalesce(sum(monto), 0) into v_total_abonado
  from abonos_venta where venta_id = v_venta_id;

  select coalesce(valor_total, 0) into v_valor_total from ventas where id = v_venta_id;

  select max(fecha) into v_ultima_fecha
  from abonos_venta where venta_id = v_venta_id;

  update ventas
  set saldo = greatest(v_valor_total - v_total_abonado, 0),
      fecha_pago = case when v_total_abonado >= v_valor_total and v_valor_total > 0 then v_ultima_fecha else null end
  where id = v_venta_id;

  return coalesce(new, old);
end;
$$;

revoke execute on function fn_recalcular_venta_pago() from public;
revoke execute on function fn_recalcular_venta_pago() from anon;
revoke execute on function fn_recalcular_venta_pago() from authenticated;

drop trigger if exists trg_recalcular_venta_pago on abonos_venta;
create trigger trg_recalcular_venta_pago
  after insert or update or delete on abonos_venta
  for each row execute function fn_recalcular_venta_pago();

-- Trigger: mantiene saldo/fecha_pago sincronizados con los abonos que ya
-- existan (a) cuando se crea una venta nueva -antes no corría nada en el
-- INSERT, así que una venta sin abono inicial se quedaba con saldo = 0 en
-- vez de saldo = valor_total- y (b) cuando cambias el valor_total de una
-- venta existente a mano (columna "Total" en la tabla de Ventas).
create or replace function fn_recalcular_venta_pago_por_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_abonado numeric;
  v_ultima_fecha date;
begin
  if TG_OP = 'INSERT' or new.valor_total is distinct from old.valor_total then
    select coalesce(sum(monto), 0), max(fecha) into v_total_abonado, v_ultima_fecha
    from abonos_venta where venta_id = new.id;

    new.saldo := greatest(coalesce(new.valor_total, 0) - v_total_abonado, 0);
    new.fecha_pago := case when v_total_abonado >= coalesce(new.valor_total, 0) and coalesce(new.valor_total, 0) > 0 then v_ultima_fecha else null end;
  end if;
  return new;
end;
$$;

revoke execute on function fn_recalcular_venta_pago_por_total() from public;
revoke execute on function fn_recalcular_venta_pago_por_total() from anon;
revoke execute on function fn_recalcular_venta_pago_por_total() from authenticated;

drop trigger if exists trg_recalcular_venta_pago_por_total on ventas;
create trigger trg_recalcular_venta_pago_por_total
  before insert or update of valor_total on ventas
  for each row execute function fn_recalcular_venta_pago_por_total();

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
