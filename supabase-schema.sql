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
  cantidad numeric not null default 0,
  valor_unitario numeric not null default 0,
  valor_total numeric not null default 0,
  fecha date not null default current_date,
  quien_pago text,
  factura text,
  created_at timestamptz default now()
);

create table if not exists ventas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references productos(id) on delete set null,
  nombre_producto text,
  cantidad numeric not null default 0,
  precio_venta numeric not null default 0,
  valor_total numeric not null default 0,
  cliente text,
  fecha_entrega date not null default current_date,
  fecha_pago date,
  abono numeric default 0,
  saldo numeric default 0,
  metodo_pago text,
  created_at timestamptz default now()
);

-- Si la tabla ventas ya existía antes de agregar nombre_producto y fecha_pago, ejecuta estas líneas:
alter table ventas add column if not exists nombre_producto text;
alter table ventas add column if not exists fecha_pago date;

-- Habilita el acceso en tiempo real (para que ambos vean los cambios del otro al instante)
alter publication supabase_realtime add table productos;
alter publication supabase_realtime add table compras;
alter publication supabase_realtime add table ventas;

-- Seguridad a nivel de fila (RLS): la app usa la llave "anon" pública, así que
-- se habilita RLS pero se permite lectura/escritura a cualquiera que tenga el enlace de la app.
-- Esto es apropiado para un equipo pequeño y confiable (tú y tu socio) sin sistema de login.
-- Si en el futuro quieres exigir inicio de sesión, se pueden ajustar estas políticas.

alter table productos enable row level security;
alter table compras enable row level security;
alter table ventas enable row level security;

create policy "acceso total productos" on productos for all using (true) with check (true);
create policy "acceso total compras" on compras for all using (true) with check (true);
create policy "acceso total ventas" on ventas for all using (true) with check (true);
