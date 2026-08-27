# Alerick Glam · Inventario

App de Inventario, Compras y Ventas, con base de datos en Supabase y sincronización en tiempo real.

## Pasos para publicarla

1. Crea el proyecto en Supabase y corre `supabase-schema.sql` en el SQL Editor.
2. Copia `.env.local.example` a `.env.local` y llena las dos variables con los datos de tu proyecto de Supabase (Project Settings > API).
3. Sube esta carpeta a un repositorio de GitHub.
4. Conecta ese repositorio en Vercel e importa el proyecto (detecta Next.js automáticamente).
5. En Vercel, agrega las mismas dos variables de entorno del paso 2 (Settings > Environment Variables) y despliega.

## Login (2 usuarios)

La app ahora exige inicio de sesión con Supabase Auth. Solo existen los usuarios que crees
manualmente en el panel de Supabase — no hay pantalla de registro público.

1. Ve a tu proyecto en supabase.com/dashboard > **Authentication > Users > Add user > Create new user**.
2. Crea un usuario para Erick (con su correo real) y otro para Alejandra (con el suyo), cada uno
   con una contraseña de mínimo 8 caracteres, con al menos una mayúscula y un símbolo (ej. `Glam2026!`).
3. Marca **Auto Confirm User** al crear cada uno (así no depende de un correo de confirmación).
4. (Recomendado) En **Authentication > Settings > User Signups**, desactiva "Allow new users to sign up"
   para que nadie más pueda crear su propia cuenta.
5. Entra a la app con cualquiera de esos dos correos y su contraseña.

Instrucciones detalladas paso a paso en la conversación de Claude donde se generó este proyecto.

## Importar facturas en PDF (pestaña Compras)

En la pestaña **Compras** hay un botón **"Importar factura (PDF)"**: al subir el PDF de una factura de
compra (formato POS tipo TRENDY SHOP), la app lee automáticamente cada producto, SKU, cantidad, valor
unitario, la fecha y el número de factura, y muestra una vista previa editable antes de guardar nada.
Ahí puedes corregir cualquier dato, quitar líneas, elegir quién pagó y confirmar para registrar todas
las compras de esa factura de una sola vez (en vez de escribirlas una por una).

Si la factura tiene un formato distinto y no logra leer los productos, siempre puedes seguir
registrando la compra manualmente con el botón "Registrar compra".

Esta función usa una dependencia nueva (`unpdf`, para leer PDFs). Si trabajas en tu computador con
`npm run dev`, corre `npm install` una vez después de actualizar estos archivos. En Vercel no hay que
hacer nada aparte: se instala sola al desplegar.
