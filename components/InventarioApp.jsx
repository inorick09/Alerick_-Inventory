"use client";

import { useState, useEffect, useCallback } from "react";
import { Package, ShoppingCart, TrendingUp, Plus, Trash2, Search, Sparkles, AlertCircle, SlidersHorizontal, Wallet, ClipboardList, Download } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const fmt = (n) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    Number(n) || 0
  );
const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
};
const today = () => new Date().toISOString().slice(0, 10);
const miles = (n) => new Intl.NumberFormat("es-CO").format(Number(n) || 0);

const CATEGORIAS = [
  "ACCESORIOS", "LABIOS", "OJOS", "ROSTRO", "CEJAS", "BROCHAS", "CUIDADO FACIAL",
  "CORPORAL", "CAPILAR", "DISNEY", "COLECCIÓN URBAN", "MINITREDYLOVERS", "OTRO",
];

const QUIEN_PAGO_OPCIONES = ["Erick", "Aleja", "Nequi"];

const STATUS_OPCIONES = ["Agotado", "Inventario Erik", "Inventario Aleja", "Por comprar", "Comprado"];

const METODO_PAGO_OPCIONES = ["Nequi", "Daviplata", "Llave", "Pendiente", "Nequi Erik"];

const escapeHtml = (str) =>
  String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Supabase/PostgREST solo devuelve hasta 1000 filas por consulta por defecto.
// Con .select("*") sin paginar, cualquier tabla que supere ese límite se trunca
// en silencio (sin error) y el front-end termina filtrando sobre datos incompletos.
// Este helper pagina con .range() hasta traer todas las filas, sin importar
// cuántas haya ni cuál sea el límite configurado en el proyecto.
async function fetchAllRows(buildQuery, pageSize = 1000) {
  let from = 0;
  let all = [];
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) return { data: null, error };
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}

export default function InventarioApp() {
  const [tab, setTab] = useState("inventario");
  const [productos, setProductos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [pagosPendientes, setPagosPendientes] = useState([]);
  const [porComprar, setPorComprar] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAll = useCallback(async () => {
    const [p, c, v, pp, pc, cl] = await Promise.all([
      fetchAllRows((from, to) => supabase.from("productos").select("*").order("nombre").range(from, to)),
      fetchAllRows((from, to) => supabase.from("compras").select("*").order("fecha", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("ventas").select("*").order("fecha_entrega", { ascending: false, nullsFirst: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("pagos_pendientes").select("*").order("fecha", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("por_comprar").select("*").order("created_at", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("clientes").select("*").order("nombre").range(from, to)),
    ]);
    if (p.error || c.error || v.error || pp.error || pc.error || cl.error) {
      setError("No se pudo conectar con la base de datos. Revisa la configuración de Supabase.");
      return;
    }
    setError("");
    setProductos(p.data || []);
    setCompras(c.data || []);
    setVentas(v.data || []);
    setPagosPendientes(pp.data || []);
    setPorComprar(pc.data || []);
    setClientes(cl.data || []);
  }, []);

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));

    const channel = supabase
      .channel("alerick-glam-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "productos" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "compras" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "ventas" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "pagos_pendientes" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "por_comprar" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, fetchAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  async function addProducto(p) {
    const { error } = await supabase.from("productos").insert({
      nombre: p.nombre, sku: p.sku, categoria: p.categoria, cantidad: p.cantidad, precio_venta: p.precioVenta, costo: p.costo,
    });
    if (error) setError("No se pudo guardar el producto.");
    else fetchAll();
  }
  async function deleteProducto(id) {
    const { error } = await supabase.from("productos").delete().eq("id", id);
    if (error) setError("No se pudo eliminar el producto.");
  }
  async function updatePrecioVenta(id, precioVenta) {
    setProductos((prev) => prev.map((p) => (p.id === id ? { ...p, precio_venta: precioVenta } : p)));
    const { error } = await supabase.from("productos").update({ precio_venta: precioVenta }).eq("id", id);
    if (error) {
      setError("No se pudo actualizar el precio de venta.");
      fetchAll();
    }
  }
  async function updateCantidad(id, cantidad) {
    setProductos((prev) => prev.map((p) => (p.id === id ? { ...p, cantidad } : p)));
    const { error } = await supabase.from("productos").update({ cantidad }).eq("id", id);
    if (error) {
      setError("No se pudo actualizar la cantidad.");
      fetchAll();
    }
  }
  async function addCompra(c) {
    const { error } = await supabase.from("compras").insert({
      producto_id: c.productoId, nombre_producto: c.nombreProducto, sku: c.sku, cantidad: c.cantidad, valor_unitario: c.valorUnitario,
      valor_total: c.valorTotal, fecha: c.fecha, quien_pago: c.quienPago, factura: c.factura,
    });
    if (error) setError("No se pudo guardar la compra.");
    else fetchAll();
  }
  async function deleteCompra(id) {
    const { error } = await supabase.from("compras").delete().eq("id", id);
    if (error) setError("No se pudo eliminar la compra.");
  }
  async function updateCompra(id, patch) {
    setCompras((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const { error } = await supabase.from("compras").update(patch).eq("id", id);
    if (error) {
      setError("No se pudo actualizar la compra.");
      fetchAll();
    }
  }
  async function addVenta(v) {
    const { error } = await supabase.from("ventas").insert({
      nombre_producto: v.nombreProducto, cantidad: v.cantidad, precio_venta: v.precioVenta, valor_total: v.valorTotal,
      cliente: v.cliente, fecha_entrega: v.fechaEntrega || null, fecha_pago: v.fechaPago || null, abono: v.abono, saldo: v.saldo, metodo_pago: v.metodoPago,
    });
    if (error) setError("No se pudo guardar la venta.");
    else fetchAll();
  }
  async function deleteVenta(id) {
    const { error } = await supabase.from("ventas").delete().eq("id", id);
    if (error) setError("No se pudo eliminar la venta.");
  }
  async function updateVenta(id, patch) {
    setVentas((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    const { error } = await supabase.from("ventas").update(patch).eq("id", id);
    if (error) {
      setError("No se pudo actualizar la venta.");
      fetchAll();
    }
  }
  async function updateFechaPago(id, fechaPago) {
    setVentas((prev) => prev.map((v) => (v.id === id ? { ...v, fecha_pago: fechaPago } : v)));
    const { error } = await supabase.from("ventas").update({ fecha_pago: fechaPago || null }).eq("id", id);
    if (error) {
      setError("No se pudo actualizar la fecha de pago.");
      fetchAll();
    }
  }
  async function updateFechaEntrega(id, fechaEntrega) {
    setVentas((prev) => prev.map((v) => (v.id === id ? { ...v, fecha_entrega: fechaEntrega || null } : v)));
    const { error } = await supabase.from("ventas").update({ fecha_entrega: fechaEntrega || null }).eq("id", id);
    if (error) {
      setError("No se pudo actualizar la fecha de entrega.");
      fetchAll();
    }
  }
  async function updateAbono(id, abono) {
    const venta = ventas.find((v) => v.id === id);
    if (!venta) return;
    const saldo = Math.max(Number(venta.valor_total || 0) - abono, 0);
    setVentas((prev) => prev.map((v) => (v.id === id ? { ...v, abono, saldo } : v)));
    const { error } = await supabase.from("ventas").update({ abono, saldo }).eq("id", id);
    if (error) {
      setError("No se pudo actualizar el abono.");
      fetchAll();
    }
  }
  async function addPagoPendiente(pp) {
    const { error } = await supabase.from("pagos_pendientes").insert({
      nombre: pp.nombre, monto: pp.monto, factura: pp.factura, fecha: pp.fecha,
    });
    if (error) setError("No se pudo guardar el pago pendiente.");
    else fetchAll();
  }
  async function deletePagoPendiente(id) {
    const { error } = await supabase.from("pagos_pendientes").delete().eq("id", id);
    if (error) setError("No se pudo eliminar el pago pendiente.");
  }
  async function addPorComprar(pc) {
    const { error } = await supabase.from("por_comprar").insert({
      producto: pc.producto, sku: pc.sku, tono: pc.tono, cantidad: pc.cantidad, cliente: pc.cliente, status: pc.status,
    });
    if (error) setError("No se pudo guardar el registro de por comprar.");
    else fetchAll();
  }
  async function deletePorComprar(id) {
    const { error } = await supabase.from("por_comprar").delete().eq("id", id);
    if (error) setError("No se pudo eliminar el registro.");
  }
  async function updatePorComprar(id, patch) {
    setPorComprar((prev) => prev.map((pc) => (pc.id === id ? { ...pc, ...patch } : pc)));
    const { error } = await supabase.from("por_comprar").update(patch).eq("id", id);
    if (error) {
      setError("No se pudo actualizar el registro.");
      fetchAll();
    }
  }

  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <Sparkles size={28} color="#C79A3C" />
        <p style={{ marginTop: 12, color: "#8B6B76", fontFamily: "Poppins, sans-serif" }}>Cargando…</p>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <style>{fontImport}</style>
      <header style={styles.header}>
        <div style={styles.brandRow}>
          <div style={styles.compact}><Sparkles size={16} color="#FFF8F5" /></div>
          <div>
            <h1 style={styles.brandTitle}>Alerick Glam</h1>
            <p style={styles.brandSub}>Panel de inventario · compras · ventas</p>
          </div>
        </div>
      </header>

      <nav style={styles.tabs}>
        <TabButton icon={Package} label="Inventario" active={tab === "inventario"} onClick={() => setTab("inventario")} />
        <TabButton icon={ShoppingCart} label="Compras" active={tab === "compras"} onClick={() => setTab("compras")} />
        <TabButton icon={TrendingUp} label="Ventas" active={tab === "ventas"} onClick={() => setTab("ventas")} />
        <TabButton icon={Wallet} label="Balance" active={tab === "balance"} onClick={() => setTab("balance")} />
        <TabButton icon={ClipboardList} label="Por comprar" active={tab === "porcomprar"} onClick={() => setTab("porcomprar")} />
      </nav>

      {error && (
        <div style={styles.errorBanner}><AlertCircle size={16} /><span>{error}</span></div>
      )}

      <main style={styles.main}>
        {tab === "inventario" && (
          <InventarioTab productos={productos} onAdd={addProducto} onDelete={deleteProducto} onUpdatePrecioVenta={updatePrecioVenta} onUpdateCantidad={updateCantidad} />
        )}
        {tab === "compras" && (
          <ComprasTab productos={productos} compras={compras} onAdd={addCompra} onDelete={deleteCompra} onUpdate={updateCompra} />
        )}
        {tab === "ventas" && (
          <VentasTab ventas={ventas} clientes={clientes} onAdd={addVenta} onDelete={deleteVenta} onUpdate={updateVenta} onUpdateFechaPago={updateFechaPago} onUpdateFechaEntrega={updateFechaEntrega} onUpdateAbono={updateAbono} />
        )}
        {tab === "balance" && (
          <BalanceTab ventas={ventas} compras={compras} pagosPendientes={pagosPendientes} onAdd={addPagoPendiente} onDelete={deletePagoPendiente} />
        )}
        {tab === "porcomprar" && (
          <PorComprarTab items={porComprar} clientes={clientes} onAdd={addPorComprar} onDelete={deletePorComprar} onUpdate={updatePorComprar} />
        )}
      </main>
    </div>
  );
}

function TabButton({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ ...styles.tabBtn, ...(active ? styles.tabBtnActive : {}) }}>
      <Icon size={16} />{label}
    </button>
  );
}

/* ---------------- INVENTARIO ---------------- */
function InventarioTab({ productos, onAdd, onDelete, onUpdatePrecioVenta, onUpdateCantidad }) {
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", sku: "", categoria: CATEGORIAS[0], cantidad: "", precioVenta: "", costo: "" });

  const filtered = productos
    .filter((p) => p.nombre.toLowerCase().includes(query.toLowerCase()) || (p.sku || "").toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const totalUnidades = productos.reduce((s, p) => s + (Number(p.cantidad) || 0), 0);
  const valorInventario = productos.reduce((s, p) => s + (Number(p.cantidad) || 0) * (Number(p.costo) || 0), 0);
  const bajoStock = productos.filter((p) => (Number(p.cantidad) || 0) <= 2 && (Number(p.cantidad) || 0) >= 0).length;

  function submit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    onAdd({ nombre: form.nombre.trim(), sku: form.sku.trim(), categoria: form.categoria, cantidad: Number(form.cantidad) || 0, precioVenta: Number(form.precioVenta) || 0, costo: Number(form.costo) || 0 });
    setForm({ nombre: "", sku: "", categoria: CATEGORIAS[0], cantidad: "", precioVenta: "", costo: "" });
    setShowForm(false);
  }

  return (
    <div>
      <div style={styles.statRow}>
        <StatCard label="Productos" value={productos.length} />
        <StatCard label="Unidades en inventario" value={totalUnidades} />
        <StatCard label="Valor del inventario" value={fmt(valorInventario)} />
        <StatCard label="Con cantidad baja (≤2)" value={bajoStock} accent />
      </div>

      <div style={styles.toolbar}>
        <div style={styles.searchBox}>
          <Search size={15} color="#B89099" />
          <input style={styles.searchInput} placeholder="Buscar producto o SKU…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button style={styles.primaryBtn} onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Nuevo producto</button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={styles.card}>
          <div style={styles.formGrid}>
            <Field label="Nombre del producto *">
              <input style={styles.input} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Brillo de labios Aura tono 01" required />
            </Field>
            <Field label="SKU / Referencia *">
              <input style={styles.input} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
            </Field>
            <Field label="Categoría *">
              <select style={styles.input} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} required>
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Cantidad *">
              <input type="number" min="0" style={styles.input} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} required />
            </Field>
            <Field label="Costo (compra) c/u *">
              <input type="number" min="0" style={styles.input} value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} required />
            </Field>
            <Field label="Precio venta cada uno *">
              <input type="number" min="0" style={styles.input} value={form.precioVenta} onChange={(e) => setForm({ ...form, precioVenta: e.target.value })} required />
            </Field>
          </div>
          <div style={styles.formActions}>
            <button type="button" style={styles.ghostBtn} onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" style={styles.primaryBtn}>Guardar producto</button>
          </div>
        </form>
      )}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Producto</th><th style={styles.th}>SKU</th><th style={styles.th}>Categoría</th>
              <th style={styles.th}>Cantidad</th><th style={styles.th}>Costo</th><th style={styles.th}>Precio venta cada uno</th><th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={styles.emptyCell}>Aún no hay productos que coincidan. Agrega el primero arriba.</td></tr>
            )}
            {filtered.map((p) => {
              const cantidad = Number(p.cantidad) || 0;
              return (
                <tr key={p.id}>
                  <td style={styles.td}><strong>{p.nombre}</strong></td>
                  <td style={styles.tdMuted}>{p.sku || "—"}</td>
                  <td style={styles.tdMuted}><span style={styles.pill}>{p.categoria}</span></td>
                  <td style={styles.td}>
                    <CantidadInput value={p.cantidad} onSave={(nueva) => onUpdateCantidad(p.id, nueva)} low={cantidad <= 2} />
                  </td>
                  <td style={styles.td}>{fmt(p.costo)}</td>
                  <td style={styles.td}>
                    <PrecioVentaInput value={p.precio_venta} onSave={(nuevo) => onUpdatePrecioVenta(p.id, nuevo)} />
                  </td>
                  <td style={styles.td}>
                    <button style={styles.iconBtn} onClick={() => onDelete(p.id)} title="Eliminar producto"><Trash2 size={15} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- COMPRAS ---------------- */
function ComprasTab({ productos, compras, onAdd, onDelete, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombreProducto: "", sku: "", cantidad: "1", valorUnitario: "", fecha: today(), quienPago: "", factura: "" });
  const [facturaFiltro, setFacturaFiltro] = useState("");

  const totalCompras = compras.reduce((s, c) => s + Number(c.valor_total || 0), 0);

  function submit(e) {
    e.preventDefault();
    if (!form.nombreProducto.trim()) return;
    const cantidad = Number(form.cantidad) || 0;
    const valorUnitario = Number(form.valorUnitario) || 0;
    onAdd({
      productoId: null,
      nombreProducto: form.nombreProducto.trim(),
      sku: form.sku.trim(),
      cantidad, valorUnitario, valorTotal: cantidad * valorUnitario,
      fecha: form.fecha, quienPago: form.quienPago.trim(), factura: form.factura.trim(),
    });
    setForm({ nombreProducto: "", sku: "", cantidad: "1", valorUnitario: "", fecha: today(), quienPago: "", factura: "" });
    setShowForm(false);
  }

  const productoNombreValor = (c) => c.nombre_producto || productos.find((p) => p.id === c.producto_id)?.nombre || "";

  function updateCantidadCompra(c, cantidad) {
    const nuevaCantidad = Number(cantidad) || 0;
    onUpdate(c.id, { cantidad: nuevaCantidad, valor_total: nuevaCantidad * Number(c.valor_unitario || 0) });
  }
  function updateValorUnitarioCompra(c, valorUnitario) {
    const nuevoValor = Number(valorUnitario) || 0;
    onUpdate(c.id, { valor_unitario: nuevoValor, valor_total: Number(c.cantidad || 0) * nuevoValor });
  }

  const facturaKey = (c) => (c.factura || "").trim() || "__sin_factura__";

  const facturasMap = new Map();
  for (const c of compras) {
    const key = facturaKey(c);
    if (!facturasMap.has(key)) {
      facturasMap.set(key, { key, factura: (c.factura || "").trim() || "Sin factura", fechaMin: c.fecha, fechaMax: c.fecha, unidades: 0, total: 0, lineas: 0 });
    }
    const entry = facturasMap.get(key);
    entry.unidades += Number(c.cantidad || 0);
    entry.total += Number(c.valor_total || 0);
    entry.lineas += 1;
    if (c.fecha && (!entry.fechaMin || c.fecha < entry.fechaMin)) entry.fechaMin = c.fecha;
    if (c.fecha && (!entry.fechaMax || c.fecha > entry.fechaMax)) entry.fechaMax = c.fecha;
  }
  const resumenFacturas = Array.from(facturasMap.values()).sort((a, b) => (b.fechaMax || "").localeCompare(a.fechaMax || ""));

  const sorted = facturaFiltro ? compras.filter((c) => facturaKey(c) === facturaFiltro) : [];

  return (
    <div>
      <div style={styles.statRow}>
        <StatCard label="Compras registradas" value={compras.length} />
        <StatCard label="Total invertido" value={fmt(totalCompras)} accent />
      </div>

      <div style={styles.toolbar}>
        <div />
        <button style={styles.primaryBtn} onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Registrar compra</button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={styles.card}>
          <div style={styles.formGrid}>
            <Field label="Producto *" wide>
              <input style={styles.input} placeholder="Nombre del producto" value={form.nombreProducto} onChange={(e) => setForm({ ...form, nombreProducto: e.target.value })} required />
            </Field>
            <Field label="SKU / Referencia *">
              <input style={styles.input} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
            </Field>
            <Field label="Cantidad *">
              <input type="number" min="1" style={styles.input} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} required />
            </Field>
            <Field label="Valor unitario *">
              <input type="number" min="0" style={styles.input} value={form.valorUnitario} onChange={(e) => setForm({ ...form, valorUnitario: e.target.value })} required />
            </Field>
            <Field label="Fecha de compra *">
              <input type="date" style={styles.input} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
            </Field>
            <Field label="Quién pagó *">
              <select style={styles.input} value={form.quienPago} onChange={(e) => setForm({ ...form, quienPago: e.target.value })} required>
                <option value="">Selecciona…</option>
                {QUIEN_PAGO_OPCIONES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="N.º de factura *">
              <input style={styles.input} value={form.factura} onChange={(e) => setForm({ ...form, factura: e.target.value })} required />
            </Field>
          </div>
          <div style={styles.formActions}>
            <button type="button" style={styles.ghostBtn} onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" style={styles.primaryBtn}>Guardar compra</button>
          </div>
        </form>
      )}

      <h3 style={styles.sectionTitle}>Resumen por factura</h3>
      <div style={{ ...styles.tableWrap, marginBottom: 20 }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Factura</th><th style={styles.th}>Fecha</th>
              <th style={styles.th}>Unidades</th><th style={styles.th}>Total comprado</th>
            </tr>
          </thead>
          <tbody>
            {resumenFacturas.length === 0 && <tr><td colSpan={4} style={styles.emptyCell}>Aún no has registrado compras.</td></tr>}
            {resumenFacturas.map((f) => (
              <tr key={f.key}>
                <td style={styles.td}><strong>{f.factura}</strong></td>
                <td style={styles.tdMuted}>{f.fechaMin === f.fechaMax ? fmtDate(f.fechaMin) : `${fmtDate(f.fechaMin)} – ${fmtDate(f.fechaMax)}`}</td>
                <td style={styles.td}>{f.unidades}</td>
                <td style={styles.td}>{fmt(f.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Detalle de compras</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
          <label style={styles.label}>Filtrar por factura</label>
          <select style={styles.input} value={facturaFiltro} onChange={(e) => setFacturaFiltro(e.target.value)}>
            <option value="">Selecciona una factura…</option>
            {resumenFacturas.map((f) => <option key={f.key} value={f.key}>{f.factura}</option>)}
          </select>
        </div>
      </div>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Fecha</th><th style={styles.th}>Producto</th><th style={styles.th}>SKU</th><th style={styles.th}>Cant.</th>
              <th style={styles.th}>Valor unit.</th><th style={styles.th}>Total</th><th style={styles.th}>Quién pagó</th>
              <th style={styles.th}>Factura</th><th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} style={styles.emptyCell}>
                  {facturaFiltro ? "Esta factura no tiene compras registradas." : "Selecciona una factura arriba para ver el detalle de sus compras."}
                </td>
              </tr>
            )}
            {sorted.map((c) => (
              <tr key={c.id}>
                <td style={styles.td}>
                  <FechaPagoInput value={c.fecha} onSave={(nueva) => onUpdate(c.id, { fecha: nueva })} />
                </td>
                <td style={styles.td}>
                  <TextCellInput value={productoNombreValor(c)} onSave={(nuevo) => onUpdate(c.id, { nombre_producto: nuevo })} width={160} />
                </td>
                <td style={styles.td}>
                  <TextCellInput value={c.sku} onSave={(nuevo) => onUpdate(c.id, { sku: nuevo })} width={100} />
                </td>
                <td style={styles.td}>
                  <CantidadInput value={c.cantidad} onSave={(nueva) => updateCantidadCompra(c, nueva)} />
                </td>
                <td style={styles.td}>
                  <MoneyCellInput value={c.valor_unitario} onSave={(nuevo) => updateValorUnitarioCompra(c, nuevo)} />
                </td>
                <td style={styles.td}>{fmt(c.valor_total)}</td>
                <td style={styles.td}>
                  <QuienPagoSelect value={c.quien_pago} onSave={(nuevo) => onUpdate(c.id, { quien_pago: nuevo })} />
                </td>
                <td style={styles.td}>
                  <TextCellInput value={c.factura} onSave={(nuevo) => onUpdate(c.id, { factura: nuevo })} width={110} />
                </td>
                <td style={styles.td}><button style={styles.iconBtn} onClick={() => onDelete(c.id)} title="Eliminar compra"><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- VENTAS ---------------- */
const VENTAS_FILTROS_VACIOS = { cliente: "", producto: "", fechaEntrega: "", fechaPago: "", soloConSaldo: false };

function VentasTab({ ventas, clientes, onAdd, onDelete, onUpdate, onUpdateFechaPago, onUpdateFechaEntrega, onUpdateAbono }) {
  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(VENTAS_FILTROS_VACIOS);
  const [form, setForm] = useState({ nombreProducto: "", cantidad: "1", precioVenta: "", cliente: "", fechaEntrega: "", fechaPago: "", abono: "", metodoPago: METODO_PAGO_OPCIONES[0] });

  const totalAbonos = ventas.reduce((s, v) => s + Number(v.abono || 0), 0);
  const totalSaldo = ventas.reduce((s, v) => s + Number(v.saldo || 0), 0);

  function submit(e) {
    e.preventDefault();
    if (!form.nombreProducto.trim()) return;
    const cantidad = Number(form.cantidad) || 0;
    const precioVenta = Number(form.precioVenta) || 0;
    const valorTotal = cantidad * precioVenta;
    const abono = Number(form.abono) || 0;
    onAdd({
      nombreProducto: form.nombreProducto.trim(), cantidad, precioVenta, valorTotal,
      cliente: form.cliente.trim(), fechaEntrega: form.fechaEntrega, fechaPago: form.fechaPago, abono,
      saldo: Math.max(valorTotal - abono, 0), metodoPago: form.metodoPago,
    });
    setForm({ nombreProducto: "", cantidad: "1", precioVenta: "", cliente: "", fechaEntrega: "", fechaPago: "", abono: "", metodoPago: METODO_PAGO_OPCIONES[0] });
    setShowForm(false);
  }

  function updateValorTotalVenta(v, nuevoTotal) {
    const total = Number(nuevoTotal) || 0;
    const saldo = Math.max(total - Number(v.abono || 0), 0);
    onUpdate(v.id, { valor_total: total, saldo });
  }

  const filtrosActivos =
    filters.cliente.trim() !== "" || filters.producto.trim() !== "" || filters.fechaEntrega !== "" || filters.fechaPago !== "" || filters.soloConSaldo;

  const filtered = ventas.filter((v) => {
    if (filters.cliente.trim() && !(v.cliente || "").toLowerCase().includes(filters.cliente.trim().toLowerCase())) return false;
    if (filters.producto.trim() && !(v.nombre_producto || "").toLowerCase().includes(filters.producto.trim().toLowerCase())) return false;
    if (filters.fechaEntrega && v.fecha_entrega !== filters.fechaEntrega) return false;
    if (filters.fechaPago && v.fecha_pago !== filters.fechaPago) return false;
    if (filters.soloConSaldo && !((Number(v.saldo) || 0) > 0)) return false;
    return true;
  });

  const sorted = filtrosActivos
    ? filtered
    : [...ventas].sort((a, b) => (b.fecha_pago || "").localeCompare(a.fecha_pago || "")).slice(0, 50);

  const abonoFiltrado = filtered.reduce((s, v) => s + Number(v.abono || 0), 0);
  const saldoFiltrado = filtered.reduce((s, v) => s + Number(v.saldo || 0), 0);

  return (
    <div>
      <div style={styles.statRow}>
        <StatCard label="Ventas registradas" value={ventas.length} />
        <StatCard label="Total vendido" value={fmt(totalAbonos)} />
        <StatCard label="Saldo por cobrar" value={fmt(totalSaldo)} accent />
      </div>

      {filtrosActivos && (
        <div style={styles.statRow}>
          <StatCard label="Resultados filtrados" value={filtered.length} />
          <StatCard label="Vendido (filtrado)" value={fmt(abonoFiltrado)} />
          <StatCard label="Saldo (filtrado)" value={fmt(saldoFiltrado)} accent />
        </div>
      )}

      <div style={styles.toolbar}>
        <button style={{ ...styles.ghostBtn, ...(filtrosActivos ? styles.ghostBtnActive : {}) }} onClick={() => setShowFilters((s) => !s)}>
          <SlidersHorizontal size={15} /> Filtros{filtrosActivos ? " •" : ""}
        </button>
        <button style={styles.primaryBtn} onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Registrar venta</button>
        <button
          style={styles.ghostBtn}
          onClick={() =>
            exportVentasPNG(sorted, {
              totalAbono: filtrosActivos ? abonoFiltrado : totalAbonos,
              totalSaldo: filtrosActivos ? saldoFiltrado : totalSaldo,
            }, filtrosActivos)
          }
        >
          <Download size={15} /> Exportar PNG
        </button>
      </div>

      {!filtrosActivos && ventas.length > 50 && (
        <p style={{ fontSize: 12.5, color: "#8B6B76", margin: "-6px 0 14px" }}>
          Mostrando las 50 ventas más recientes por fecha de pago. Usa los filtros para ver el resto.
        </p>
      )}

      {showFilters && (
        <div style={styles.card}>
          <div style={styles.formGrid}>
            <Field label="Cliente">
              <input style={styles.input} value={filters.cliente} onChange={(e) => setFilters({ ...filters, cliente: e.target.value })} placeholder="Buscar por cliente…" />
            </Field>
            <Field label="Producto">
              <input style={styles.input} value={filters.producto} onChange={(e) => setFilters({ ...filters, producto: e.target.value })} placeholder="Buscar por producto…" />
            </Field>
            <Field label="Fecha de entrega">
              <input type="date" style={styles.input} value={filters.fechaEntrega} onChange={(e) => setFilters({ ...filters, fechaEntrega: e.target.value })} />
            </Field>
            <Field label="Fecha de pago">
              <input type="date" style={styles.input} value={filters.fechaPago} onChange={(e) => setFilters({ ...filters, fechaPago: e.target.value })} />
            </Field>
            <Field label="Saldo">
              <label style={styles.checkboxRow}>
                <input type="checkbox" checked={filters.soloConSaldo} onChange={(e) => setFilters({ ...filters, soloConSaldo: e.target.checked })} />
                Solo con saldo pendiente
              </label>
            </Field>
          </div>
          <div style={styles.formActions}>
            <button type="button" style={styles.ghostBtn} onClick={() => setFilters(VENTAS_FILTROS_VACIOS)}>Limpiar filtros</button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} style={styles.card}>
          <div style={styles.formGrid}>
            <Field label="Producto *" wide>
              <input style={styles.input} value={form.nombreProducto} onChange={(e) => setForm({ ...form, nombreProducto: e.target.value })} placeholder="Nombre del producto" required />
            </Field>
            <Field label="Cantidad *">
              <input type="number" min="1" style={styles.input} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} required />
            </Field>
            <Field label="Precio de venta c/u *">
              <input type="number" min="0" style={styles.input} value={form.precioVenta} onChange={(e) => setForm({ ...form, precioVenta: e.target.value })} required />
            </Field>
            <Field label="Cliente *">
              <ClienteSelect
                value={form.cliente}
                clientes={clientes}
                onChange={(nuevo) => setForm({ ...form, cliente: nuevo })}
                inputStyle={styles.input}
                required
              />
            </Field>
            <Field label="Fecha de entrega">
              <input type="date" style={styles.input} value={form.fechaEntrega} onChange={(e) => setForm({ ...form, fechaEntrega: e.target.value })} />
            </Field>
            <Field label="Fecha de pago">
              <input type="date" style={styles.input} value={form.fechaPago} onChange={(e) => setForm({ ...form, fechaPago: e.target.value })} />
            </Field>
            <Field label="Abono recibido *">
              <input type="number" min="0" style={styles.input} value={form.abono} onChange={(e) => setForm({ ...form, abono: e.target.value })} required />
            </Field>
            <Field label="Método de pago *">
              <select style={styles.input} value={form.metodoPago} onChange={(e) => setForm({ ...form, metodoPago: e.target.value })} required>
                {METODO_PAGO_OPCIONES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </div>
          <div style={styles.formActions}>
            <button type="button" style={styles.ghostBtn} onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" style={styles.primaryBtn}>Guardar venta</button>
          </div>
        </form>
      )}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Producto</th><th style={styles.th}>Cantidad</th><th style={styles.th}>Cliente</th>
              <th style={styles.th}>Total</th><th style={styles.th}>Fecha entrega</th><th style={styles.th}>Fecha de pago</th>
              <th style={styles.th}>Abono</th><th style={styles.th}>Saldo</th><th style={styles.th}>Pago</th><th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={10} style={styles.emptyCell}>{filtrosActivos ? "Ningún resultado coincide con los filtros." : "Aún no has registrado ventas."}</td></tr>
            )}
            {sorted.map((v) => (
              <tr key={v.id}>
                <td style={styles.td}>
                  <TextCellInput value={v.nombre_producto} onSave={(nuevo) => onUpdate(v.id, { nombre_producto: nuevo })} width={140} />
                </td>
                <td style={styles.td}>
                  <CantidadInput value={v.cantidad} onSave={(nueva) => onUpdate(v.id, { cantidad: nueva })} />
                </td>
                <td style={styles.td}>
                  <ClienteSelect
                    value={v.cliente}
                    clientes={clientes}
                    onChange={(nuevo) => onUpdate(v.id, { cliente: nuevo })}
                    width={140}
                  />
                </td>
                <td style={styles.td}>
                  <MoneyCellInput value={v.valor_total} onSave={(nuevo) => updateValorTotalVenta(v, nuevo)} />
                </td>
                <td style={styles.td}>
                  <FechaPagoInput value={v.fecha_entrega} onSave={(nueva) => onUpdateFechaEntrega(v.id, nueva)} />
                </td>
                <td style={styles.td}>
                  <FechaPagoInput value={v.fecha_pago} onSave={(nueva) => onUpdateFechaPago(v.id, nueva)} />
                </td>
                <td style={styles.td}>
                  <MoneyCellInput value={v.abono} onSave={(nuevo) => onUpdateAbono(v.id, nuevo)} />
                </td>
                <td style={styles.td}><span style={{ ...styles.stockPill, ...(v.saldo > 0 ? styles.stockLow : {}) }}>{fmt(v.saldo)}</span></td>
                <td style={styles.td}>
                  <MetodoPagoSelect value={v.metodo_pago} onSave={(nuevo) => onUpdate(v.id, { metodo_pago: nuevo })} />
                </td>
                <td style={styles.td}><button style={styles.iconBtn} onClick={() => onDelete(v.id)} title="Eliminar venta"><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(truncated + "…").width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "…";
}

function exportVentasPNG(rows, resumen, filtrosActivos) {
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  mctx.font = "bold 11px Arial";
  let productoWidth = mctx.measureText("PRODUCTO").width + 16;
  mctx.font = "12px Arial";
  rows.forEach((v) => {
    productoWidth = Math.max(productoWidth, mctx.measureText(v.nombre_producto || "—").width + 16);
  });
  productoWidth = Math.max(170, Math.ceil(productoWidth));

  const cols = [
    { key: "producto", label: "Producto", width: productoWidth },
    { key: "cantidad", label: "Cant.", width: 55 },
    { key: "abono", label: "Abono", width: 100 },
    { key: "saldo", label: "Saldo", width: 100 },
    { key: "pago", label: "Pago", width: 90 },
  ];
  const padding = 24;
  const rowHeight = 30;
  const headerHeight = 34;
  const titleHeight = 62;
  const footerHeight = 34;
  const tableWidth = cols.reduce((s, c) => s + c.width, 0);
  const width = tableWidth + padding * 2;
  const bodyHeight = Math.max(rows.length, 1) * rowHeight;
  const height = titleHeight + headerHeight + bodyHeight + footerHeight + padding;

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#FBF3F1";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#3B2A33";
  ctx.font = "bold 18px Arial";
  ctx.fillText(`Reporte de ventas${filtrosActivos ? " (filtrado)" : ""}`, padding, 30);
  ctx.font = "12px Arial";
  ctx.fillStyle = "#8B6B76";
  ctx.fillText(
    `Generado el ${new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}`,
    padding,
    48
  );

  let y = titleHeight;
  ctx.fillStyle = "#FCEFE0";
  ctx.fillRect(padding, y, tableWidth, headerHeight);
  ctx.fillStyle = "#8B6B76";
  ctx.font = "bold 11px Arial";
  let x = padding;
  cols.forEach((c) => {
    ctx.fillText(c.label.toUpperCase(), x + 8, y + 21);
    x += c.width;
  });

  y += headerHeight;
  ctx.font = "12px Arial";
  if (rows.length === 0) {
    ctx.fillStyle = "#8B6B76";
    ctx.fillText("No hay ventas para mostrar.", padding + 8, y + 20);
    y += rowHeight;
  } else {
    rows.forEach((v, i) => {
      if (i % 2 === 1) {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(padding, y, tableWidth, rowHeight);
      }
      const values = [
        v.nombre_producto || "—",
        String(v.cantidad ?? "—"),
        fmt(v.abono),
        fmt(v.saldo),
        v.metodo_pago || "—",
      ];
      x = padding;
      ctx.font = "12px Arial";
      cols.forEach((c, ci) => {
        ctx.fillStyle = ci === 3 && Number(v.saldo) > 0 ? "#A9791F" : "#3B2A33";
        const text = ci === 0 ? values[ci] : truncateToWidth(ctx, values[ci], c.width - 16);
        ctx.fillText(text, x + 8, y + 20);
        x += c.width;
      });
      y += rowHeight;
    });
  }

  y += 18;
  ctx.fillStyle = "#D9678C";
  ctx.font = "bold 14px Arial";
  ctx.fillText(`Saldo total: ${fmt(resumen.totalSaldo)}`, padding, y);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas_${today()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}

/* ---------------- BALANCE ---------------- */
function BalanceTab({ ventas, compras, pagosPendientes, onAdd, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", monto: "", factura: "", fecha: today() });

  const totalVentas = ventas.reduce((s, v) => s + Number(v.abono || 0), 0);
  const totalCompras = compras.reduce((s, c) => s + Number(c.valor_total || 0), 0);
  const resultado = totalVentas - totalCompras;
  const totalPendientes = pagosPendientes.reduce((s, pp) => s + Number(pp.monto || 0), 0);

  function submit(e) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.monto) return;
    onAdd({ nombre: form.nombre.trim(), monto: Number(form.monto) || 0, factura: form.factura.trim(), fecha: form.fecha });
    setForm({ nombre: "", monto: "", factura: "", fecha: today() });
    setShowForm(false);
  }

  const sorted = [...pagosPendientes];

  return (
    <div>
      <div style={styles.statRow}>
        <StatCard label="Total de ventas" value={fmt(totalVentas)} />
        <StatCard label="Total invertido (compras)" value={fmt(totalCompras)} />
        <StatCard label="Resultado (ventas - compras)" value={fmt(resultado)} accent />
      </div>

      <h3 style={styles.sectionTitle}>Total ganancia cada uno</h3>
      <div style={styles.statRow}>
        <StatCard label="Erick" value={fmt(resultado / 2)} />
        <StatCard label="Aleja" value={fmt(resultado / 2)} />
      </div>

      <h3 style={styles.sectionTitle}>Pagos pendientes</h3>
      <div style={styles.statRow}>
        <StatCard label="Personas con pagos pendientes" value={pagosPendientes.length} />
        <StatCard label="Total pendiente por pagar" value={fmt(totalPendientes)} accent />
      </div>

      <div style={styles.toolbar}>
        <div />
        <button style={styles.primaryBtn} onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Registrar pago pendiente</button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={styles.card}>
          <div style={styles.formGrid}>
            <Field label="Nombre de la persona *">
              <input style={styles.input} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="¿A quién se le debe?" required />
            </Field>
            <Field label="Monto que se debe *">
              <input type="number" min="0" style={styles.input} value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} required />
            </Field>
            <Field label="N.º de factura">
              <input style={styles.input} value={form.factura} onChange={(e) => setForm({ ...form, factura: e.target.value })} />
            </Field>
            <Field label="Fecha">
              <input type="date" style={styles.input} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Field>
          </div>
          <div style={styles.formActions}>
            <button type="button" style={styles.ghostBtn} onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" style={styles.primaryBtn}>Guardar pago pendiente</button>
          </div>
        </form>
      )}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Nombre</th><th style={styles.th}>Monto</th>
              <th style={styles.th}>Factura</th><th style={styles.th}>Fecha</th><th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={5} style={styles.emptyCell}>No hay pagos pendientes registrados.</td></tr>}
            {sorted.map((pp) => (
              <tr key={pp.id}>
                <td style={styles.td}><strong>{pp.nombre}</strong></td>
                <td style={styles.td}>{fmt(pp.monto)}</td>
                <td style={styles.tdMuted}>{pp.factura || "—"}</td>
                <td style={styles.tdMuted}>{fmtDate(pp.fecha)}</td>
                <td style={styles.td}><button style={styles.iconBtn} onClick={() => onDelete(pp.id)} title="Eliminar pago pendiente"><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PORCOMPRAR_FILTROS_VACIOS = { cliente: "", status: "" };

function exportResumenPDF(resumenAgrupado) {
  const rows = [];
  resumenAgrupado.forEach((g) => {
    g.tonos.forEach(([tono, cantidad], i) => {
      rows.push(
        `<tr><td>${i === 0 ? escapeHtml(g.producto) : ""}</td><td>${i === 0 ? escapeHtml(g.sku || "—") : ""}</td><td>${escapeHtml(tono)}</td><td>${escapeHtml(cantidad)}</td></tr>`
      );
    });
  });
  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Resumen: agotado y por comprar</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #3B2A33; }
      h1 { font-size: 18px; margin-bottom: 4px; }
      p.meta { font-size: 12px; color: #8B6B76; margin-top: 0; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 6px 10px; font-size: 13px; text-align: left; }
      th { background: #FCEFE0; }
    </style>
  </head><body>
    <h1>Resumen: agotado y por comprar</h1>
    <p class="meta">Generado el ${escapeHtml(new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" }))}</p>
    <table>
      <thead><tr><th>Producto</th><th>SKU</th><th>Tono</th><th>Cantidad</th></tr></thead>
      <tbody>${rows.join("") || `<tr><td colspan="4">No hay productos agotados ni por comprar.</td></tr>`}</tbody>
    </table>
  </body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

/* ---------------- POR COMPRAR ---------------- */
function PorComprarTab({ items, clientes, onAdd, onDelete, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(PORCOMPRAR_FILTROS_VACIOS);
  const [form, setForm] = useState({ producto: "", sku: "", tono: "", cantidad: "1", cliente: "", status: STATUS_OPCIONES[3] });

  function submit(e) {
    e.preventDefault();
    if (!form.producto.trim()) return;
    onAdd({
      producto: form.producto.trim(), sku: form.sku.trim(), tono: form.tono.trim(),
      cantidad: Number(form.cantidad) || 0, cliente: form.cliente.trim(), status: form.status,
    });
    setForm({ producto: "", sku: "", tono: "", cantidad: "1", cliente: "", status: STATUS_OPCIONES[3] });
    setShowForm(false);
  }

  const filtrosActivos = filters.cliente.trim() !== "" || filters.status !== "";

  const sorted = items.filter((pc) => {
    if (filters.cliente.trim() && !(pc.cliente || "").toLowerCase().includes(filters.cliente.trim().toLowerCase())) return false;
    if (filters.status && pc.status !== filters.status) return false;
    return true;
  });

  const resumenMap = new Map();
  for (const pc of items) {
    if (pc.status !== "Agotado" && pc.status !== "Por comprar") continue;
    const key = `${pc.producto}|||${pc.sku || ""}`;
    if (!resumenMap.has(key)) resumenMap.set(key, { producto: pc.producto, sku: pc.sku, tonos: new Map() });
    const grupo = resumenMap.get(key);
    const tonoKey = (pc.tono || "").trim() || "—";
    grupo.tonos.set(tonoKey, (grupo.tonos.get(tonoKey) || 0) + (Number(pc.cantidad) || 0));
  }
  const resumenAgrupado = Array.from(resumenMap.values())
    .map((g) => ({ ...g, tonos: Array.from(g.tonos.entries()) }))
    .sort((a, b) => a.producto.localeCompare(b.producto));

  return (
    <div>
      <div style={styles.statRow}>
        <StatCard label="Productos por comprar" value={items.length} />
      </div>

      <div style={{ ...styles.toolbar, marginBottom: 10 }}>
        <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Resumen: agotado y por comprar</h3>
        <button style={styles.ghostBtn} onClick={() => exportResumenPDF(resumenAgrupado)}><Download size={15} /> Exportar PDF</button>
      </div>
      <div style={{ ...styles.tableWrap, marginBottom: 20 }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Producto</th><th style={styles.th}>SKU</th><th style={styles.th}>Tono</th><th style={styles.th}>Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {resumenAgrupado.length === 0 && <tr><td colSpan={4} style={styles.emptyCell}>No hay productos agotados ni por comprar.</td></tr>}
            {resumenAgrupado.map((g) =>
              g.tonos.map(([tono, cantidad], i) => (
                <tr key={`${g.producto}|||${g.sku}|||${tono}`}>
                  {i === 0 && (
                    <>
                      <td style={styles.td} rowSpan={g.tonos.length}><strong>{g.producto}</strong></td>
                      <td style={styles.tdMuted} rowSpan={g.tonos.length}>{g.sku || "—"}</td>
                    </>
                  )}
                  <td style={styles.tdMuted}>{tono}</td>
                  <td style={styles.td}>{cantidad}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h3 style={styles.sectionTitle}>Detalle completo</h3>
      <div style={styles.toolbar}>
        <button style={{ ...styles.ghostBtn, ...(filtrosActivos ? styles.ghostBtnActive : {}) }} onClick={() => setShowFilters((s) => !s)}>
          <SlidersHorizontal size={15} /> Filtros{filtrosActivos ? " •" : ""}
        </button>
        <button style={styles.primaryBtn} onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Registrar producto</button>
      </div>

      {showFilters && (
        <div style={styles.card}>
          <div style={styles.formGrid}>
            <Field label="Cliente">
              <input style={styles.input} value={filters.cliente} onChange={(e) => setFilters({ ...filters, cliente: e.target.value })} placeholder="Buscar por cliente…" />
            </Field>
            <Field label="Status">
              <select style={styles.input} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="">Todos</option>
                {STATUS_OPCIONES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </div>
          <div style={styles.formActions}>
            <button type="button" style={styles.ghostBtn} onClick={() => setFilters(PORCOMPRAR_FILTROS_VACIOS)}>Limpiar filtros</button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} style={styles.card}>
          <div style={styles.formGrid}>
            <Field label="Producto *" wide>
              <input style={styles.input} value={form.producto} onChange={(e) => setForm({ ...form, producto: e.target.value })} required />
            </Field>
            <Field label="SKU *">
              <input style={styles.input} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
            </Field>
            <Field label="Tono *">
              <input style={styles.input} value={form.tono} onChange={(e) => setForm({ ...form, tono: e.target.value })} required />
            </Field>
            <Field label="Cantidad *">
              <input type="number" min="0" style={styles.input} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} required />
            </Field>
            <Field label="Cliente *">
              <ClienteSelect
                value={form.cliente}
                clientes={clientes}
                onChange={(nuevo) => setForm({ ...form, cliente: nuevo })}
                inputStyle={styles.input}
                required
              />
            </Field>
            <Field label="Status *">
              <select style={styles.input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} required>
                {STATUS_OPCIONES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </div>
          <div style={styles.formActions}>
            <button type="button" style={styles.ghostBtn} onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" style={styles.primaryBtn}>Guardar</button>
          </div>
        </form>
      )}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Producto</th><th style={styles.th}>SKU</th><th style={styles.th}>Tono</th>
              <th style={styles.th}>Cantidad</th><th style={styles.th}>Cliente</th><th style={styles.th}>Status</th><th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={7} style={styles.emptyCell}>{filtrosActivos ? "Ningún resultado coincide con los filtros." : "Aún no has registrado productos por comprar."}</td></tr>}
            {sorted.map((pc) => (
              <tr key={pc.id}>
                <td style={styles.td}>
                  <TextCellInput value={pc.producto} onSave={(nuevo) => onUpdate(pc.id, { producto: nuevo })} width={160} />
                </td>
                <td style={styles.td}>
                  <TextCellInput value={pc.sku} onSave={(nuevo) => onUpdate(pc.id, { sku: nuevo })} width={100} />
                </td>
                <td style={styles.td}>
                  <TextCellInput value={pc.tono} onSave={(nuevo) => onUpdate(pc.id, { tono: nuevo })} width={100} />
                </td>
                <td style={styles.td}>
                  <CantidadInput value={pc.cantidad} onSave={(nueva) => onUpdate(pc.id, { cantidad: Number(nueva) || 0 })} />
                </td>
                <td style={styles.td}>
                  <ClienteSelect
                    value={pc.cliente}
                    clientes={clientes}
                    onChange={(nuevo) => onUpdate(pc.id, { cliente: nuevo })}
                    width={140}
                  />
                </td>
                <td style={styles.td}>
                  <select style={{ ...styles.priceInput, width: 170 }} value={pc.status || STATUS_OPCIONES[3]} onChange={(e) => onUpdate(pc.id, { status: e.target.value })}>
                    {STATUS_OPCIONES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td style={styles.td}><button style={styles.iconBtn} onClick={() => onDelete(pc.id)} title="Eliminar registro"><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ ...styles.statCard, ...(accent ? styles.statCardAccent : {}) }}>
      <p style={styles.statLabel}>{label}</p>
      <p style={styles.statValue}>{value}</p>
    </div>
  );
}
function PrecioVentaInput({ value, onSave }) {
  const [draft, setDraft] = useState(String(value ?? 0));

  useEffect(() => {
    setDraft(String(value ?? 0));
  }, [value]);

  function commit() {
    const nuevo = Number(draft) || 0;
    if (nuevo !== Number(value)) onSave(nuevo);
    else setDraft(String(value ?? 0));
  }

  return (
    <input
      type="number"
      min="0"
      style={styles.priceInput}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
function MoneyCellInput({ value, onSave, width }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(value ?? 0));

  useEffect(() => {
    if (!focused) setDraft(String(value ?? 0));
  }, [value, focused]);

  function commit() {
    setFocused(false);
    const nuevo = Number(draft.replace(/\D/g, "")) || 0;
    if (nuevo !== Number(value)) onSave(nuevo);
    else setDraft(String(value ?? 0));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      style={{ ...styles.priceInput, width: width || 110 }}
      value={focused ? draft : miles(value)}
      onFocus={() => { setFocused(true); setDraft(String(Number(value) || 0)); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
function CantidadInput({ value, onSave, low }) {
  const [draft, setDraft] = useState(String(value ?? 0));

  useEffect(() => {
    setDraft(String(value ?? 0));
  }, [value]);

  function commit() {
    const nueva = Number(draft) || 0;
    if (nueva !== Number(value)) onSave(nueva);
    else setDraft(String(value ?? 0));
  }

  return (
    <input
      type="number"
      min="0"
      step="1"
      style={{ ...styles.priceInput, width: 80, ...(low ? styles.priceInputLow : {}) }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
function FechaPagoInput({ value, onSave }) {
  const [draft, setDraft] = useState(value || "");

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  function commit() {
    if (draft !== (value || "")) onSave(draft);
  }

  return (
    <input
      type="date"
      style={{ ...styles.priceInput, width: 140 }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
    />
  );
}
function TextCellInput({ value, onSave, width }) {
  const [draft, setDraft] = useState(value || "");

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  function commit() {
    if (draft !== (value || "")) onSave(draft);
  }

  return (
    <input
      type="text"
      style={{ ...styles.priceInput, width: width || 140 }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
function QuienPagoSelect({ value, onSave }) {
  const opciones = value && !QUIEN_PAGO_OPCIONES.includes(value) ? [value, ...QUIEN_PAGO_OPCIONES] : QUIEN_PAGO_OPCIONES;
  return (
    <select style={{ ...styles.priceInput, width: 110 }} value={value || ""} onChange={(e) => onSave(e.target.value)}>
      <option value="">—</option>
      {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function MetodoPagoSelect({ value, onSave }) {
  const opciones = value && !METODO_PAGO_OPCIONES.includes(value) ? [value, ...METODO_PAGO_OPCIONES] : METODO_PAGO_OPCIONES;
  return (
    <select style={{ ...styles.priceInput, width: 110 }} value={value || ""} onChange={(e) => onSave(e.target.value)}>
      <option value="">—</option>
      {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
// Lista desplegable de clientes, respaldada por la tabla `clientes` (el catálogo
// unificado). Si el valor actual no está en el catálogo (dato antiguo o recién
// escrito), se agrega igual como opción para no perder el dato. La opción
// "+ Nuevo cliente…" abre un campo de texto: al confirmar, el nombre se guarda
// tal cual y el trigger de la base de datos lo registra en el catálogo, así que
// en la próxima carga ya aparece como una opción más de la lista.
function ClienteSelect({ value, clientes, onChange, width, inputStyle, required }) {
  const [modoNuevo, setModoNuevo] = useState(false);
  const [draft, setDraft] = useState("");

  const nombres = (clientes || [])
    .map((c) => c.nombre)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"));
  const opciones = value && !nombres.includes(value) ? [value, ...nombres] : nombres;
  const baseStyle = inputStyle || { ...styles.priceInput, width: width || 150 };

  function confirmarNuevo() {
    const nombre = draft.trim();
    setModoNuevo(false);
    setDraft("");
    if (nombre) onChange(nombre);
  }

  if (modoNuevo) {
    return (
      <input
        autoFocus
        type="text"
        style={baseStyle}
        placeholder="Nombre del nuevo cliente"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); confirmarNuevo(); }
          if (e.key === "Escape") { setModoNuevo(false); setDraft(""); }
        }}
        onBlur={confirmarNuevo}
      />
    );
  }

  return (
    <select
      style={baseStyle}
      value={value || ""}
      required={required}
      onChange={(e) => {
        if (e.target.value === "__nuevo__") { setModoNuevo(true); return; }
        onChange(e.target.value);
      }}
    >
      <option value="">Selecciona un cliente…</option>
      {opciones.map((n) => <option key={n} value={n}>{n}</option>)}
      <option value="__nuevo__">+ Nuevo cliente…</option>
    </select>
  );
}
function Field({ label, children, wide }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: wide ? "1 / -1" : "auto" }}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

const fontImport = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Poppins:wght@400;500;600&display=swap');`;

const styles = {
  app: { fontFamily: "'Poppins', sans-serif", background: "#FBF3F1", minHeight: "100vh", color: "#3B2A33", paddingBottom: 40 },
  loadingScreen: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" },
  header: { padding: "28px 28px 18px", borderBottom: "1px solid #EEDEE0" },
  brandRow: { display: "flex", alignItems: "center", gap: 12 },
  compact: { width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#D9678C,#C79A3C)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  brandTitle: { fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, margin: 0, color: "#B84C71" },
  brandSub: { margin: 0, fontSize: 13, color: "#8B6B76" },
  tabs: { display: "flex", gap: 6, padding: "16px 28px 0" },
  tabBtn: { display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: "10px 10px 0 0", border: "none", background: "transparent", color: "#8B6B76", fontFamily: "'Poppins', sans-serif", fontSize: 13.5, fontWeight: 500, cursor: "pointer" },
  tabBtnActive: { background: "#FFFFFF", color: "#B84C71", fontWeight: 600, boxShadow: "0 -1px 0 #EEDEE0 inset" },
  main: { padding: "22px 28px", background: "#FFFFFF", margin: "0 20px", borderRadius: "0 12px 12px 12px", boxShadow: "0 1px 3px rgba(59,42,51,0.06)" },
  errorBanner: { display: "flex", alignItems: "center", gap: 8, margin: "12px 28px 0", padding: "10px 14px", background: "#FDECEC", color: "#B4453F", borderRadius: 8, fontSize: 13 },
  statRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 },
  sectionTitle: { fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 600, color: "#B84C71", margin: "0 0 10px" },
  statCard: { background: "#FBF3F1", border: "1px solid #EEDEE0", borderRadius: 12, padding: "14px 16px" },
  statCardAccent: { background: "linear-gradient(135deg, #FCEFE0, #FBF3F1)", borderColor: "#E7CFA0" },
  statLabel: { margin: 0, fontSize: 11.5, color: "#8B6B76", textTransform: "uppercase", letterSpacing: 0.4 },
  statValue: { margin: "6px 0 0", fontSize: 20, fontWeight: 600, color: "#3B2A33", fontFamily: "'Playfair Display', serif" },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" },
  searchBox: { display: "flex", alignItems: "center", gap: 8, background: "#FBF3F1", border: "1px solid #EEDEE0", borderRadius: 10, padding: "8px 12px", flex: 1, maxWidth: 320 },
  searchInput: { border: "none", outline: "none", background: "transparent", fontSize: 13.5, fontFamily: "'Poppins', sans-serif", width: "100%", color: "#3B2A33" },
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "#D9678C", color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins', sans-serif" },
  ghostBtn: { display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid #EEDEE0", color: "#8B6B76", borderRadius: 9, padding: "9px 16px", fontSize: 13.5, cursor: "pointer", fontFamily: "'Poppins', sans-serif" },
  ghostBtnActive: { borderColor: "#D9678C", color: "#B84C71", background: "#FCEFE0" },
  checkboxRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "#3B2A33", fontFamily: "'Poppins', sans-serif" },
  linkBtn: { background: "transparent", border: "none", color: "#B84C71", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  card: { background: "#FBF3F1", border: "1px solid #EEDEE0", borderRadius: 12, padding: 18, marginBottom: 20 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 },
  formActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  label: { fontSize: 12, color: "#8B6B76", fontWeight: 500 },
  input: { border: "1px solid #EEDEE0", borderRadius: 8, padding: "9px 10px", fontSize: 13.5, fontFamily: "'Poppins', sans-serif", background: "#fff", color: "#3B2A33", outline: "none", width: "100%", boxSizing: "border-box" },
  priceInput: { border: "1px solid #EEDEE0", borderRadius: 8, padding: "6px 8px", fontSize: 13, fontFamily: "'Poppins', sans-serif", background: "#fff", color: "#3B2A33", outline: "none", width: 110, boxSizing: "border-box" },
  priceInputLow: { borderColor: "#E7CFA0", background: "#FCF1DC", color: "#A9791F" },
  inlineRow: { display: "flex", gap: 8, alignItems: "center" },
  tableWrap: { overflowX: "auto", border: "1px solid #EEDEE0", borderRadius: 12 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "10px 14px", background: "#FBF3F1", color: "#8B6B76", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600, borderBottom: "1px solid #EEDEE0" },
  td: { padding: "10px 14px", borderBottom: "1px solid #F4E9E9", color: "#3B2A33" },
  tdMuted: { padding: "10px 14px", borderBottom: "1px solid #F4E9E9", color: "#8B6B76" },
  emptyCell: { padding: "22px 14px", textAlign: "center", color: "#8B6B76", fontSize: 13 },
  pill: { background: "#F1E3E8", color: "#B84C71", padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 500 },
  stockPill: { background: "#EAF6F4", color: "#3F8F87", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  stockLow: { background: "#FCF1DC", color: "#A9791F" },
  iconBtn: { background: "transparent", border: "none", color: "#B89099", cursor: "pointer", padding: 6, borderRadius: 6 },
};
