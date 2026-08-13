# Alerick Glam · Inventario

App de Inventario, Compras y Ventas, con base de datos en Supabase y sincronización en tiempo real.

## Pasos para publicarla

1. Crea el proyecto en Supabase y corre `supabase-schema.sql` en el SQL Editor.
2. Copia `.env.local.example` a `.env.local` y llena las dos variables con los datos de tu proyecto de Supabase (Project Settings > API).
3. Sube esta carpeta a un repositorio de GitHub.
4. Conecta ese repositorio en Vercel e importa el proyecto (detecta Next.js automáticamente).
5. En Vercel, agrega las mismas dos variables de entorno del paso 2 (Settings > Environment Variables) y despliega.

Instrucciones detalladas paso a paso en la conversación de Claude donde se generó este proyecto.
