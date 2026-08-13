import "./globals.css";

export const metadata = {
  title: "Alerick Glam · Inventario",
  description: "Panel de inventario, compras y ventas de Alerick Glam",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
