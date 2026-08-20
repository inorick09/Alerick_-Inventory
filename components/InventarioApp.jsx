"use client";

import { useState, useEffect, useCallback } from "react";
import { Package, ShoppingCart, TrendingUp, Plus, Trash2, Search, Sparkles, AlertCircle, SlidersHorizontal } from "lucide-react";
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

const CATEGORIAS = [
  "ACCESORIOS", "LABIOS", "OJOS", "ROSTRO", "CEJAS", "BROCHAS", "CUIDADO FACIAL",
  "CORPORAL", "CAPILAR", "DISNEY", "COLECCIÓN URBAN", "MINITREDYLOVERS", "OTRO",
];

const QUIEN_PAGO_OPCIONES = ["Erick", "Aleja", "Nequi"];

export default function InventarioApp() {
  const [tab, setTab] = useState("inventario");
  const [productos, setProductos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAll = useCallback(async () => {
    const [p, c, v] = await Promise.all([
      supabase.from("productos").select("*").order("nombre"),
      supabase.from("compras").select("*").order("fecha", { ascending: false }),
      supabase.from("ventas").select("*").order("fecha_entrega", { ascending: false }),
    ]);
    if (p.error || c.error || v.error) {
      setError("No se pudo conectar con la base de datos. Revisa la configuración de Supabase.");
      return;
    }
    setError("");
    setProductos(p.data || []);
    setCompras(c.data || []);
    setVentas(v.data || []);
  }, []);

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));

    const channel = supabase
      .channel("alerick-glam-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "productos" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "compras" }, fetchAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "ventas" }, fetchAll)
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
      cliente: v.cliente, fecha_entrega: v.fechaEntrega, fecha_pago: v.fechaPago || null, abono: v.abono, saldo: v.saldo, metodo_pago: v.metodoPago,
    });
    if (error) setError("No se pudo guardar la venta.");
    else fetchAll();
  }
  async function deleteVenta(id) {
    const { error } = await supabase.from("ventas").delete().eq("id", id);
    if (error) setError("No se pudo eliminar la venta.");
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
    setVentas((prev) => prev.map((v) => (v.id === id ? { ...v, fecha_entrega: fechaEntrega } : v)));
    const { error } = await supabase.from("ventas").update({ fecha_entrega: fechaEntrega }).eq("id", id);
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
          <VentasTab ventas={ventas} onAdd={addVenta} onDelete={deleteVenta} onUpdateFechaPago={updateFechaPago} onUpdateFechaEntrega={updateFechaEntrega} onUpdateAbono={updateAbono} />
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
            <Field label="SKU / Referencia">
              <input style={styles.input} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </Field>
            <Field label="Categoría">
              <select style={styles.input} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Cantidad">
              <input type="number" min="0" style={styles.input} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
            </Field>
            <Field label="Costo (compra) c/u">
              <input type="number" min="0" style={styles.input} value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} />
            </Field>
            <Field label="Precio venta cada uno">
              <input type="number" min="0" style={styles.input} value={form.precioVenta} onChange={(e) => setForm({ ...form, precioVenta: e.target.value })} />
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
            <Field label="SKU / Referencia">
              <input style={styles.input} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </Field>
            <Field label="Cantidad *">
              <input type="number" min="1" style={styles.input} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} required />
            </Field>
            <Field label="Valor unitario *">
              <input type="number" min="0" style={styles.input} value={form.valorUnitario} onChange={(e) => setForm({ ...form, valorUnitario: e.target.value })} required />
            </Field>
            <Field label="Fecha de compra">
              <input type="date" style={styles.input} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Field>
            <Field label="Quién pagó">
              <select style={styles.input} value={form.quienPago} onChange={(e) => setForm({ ...form, quienPago: e.target.value })}>
                <option value="">Selecciona…</option>
                {QUIEN_PAGO_OPCIONES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="N.º de factura">
              <input style={styles.input} value={form.factura} onChange={(e) => setForm({ ...form, factura: e.target.value })} />
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
                  <PrecioVentaInput value={c.valor_unitario} onSave={(nuevo) => updateValorUnitarioCompra(c, nuevo)} />
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
const VENTAS_FILTROS_VACIOS = { cliente: "", producto: "", fechaPago: "", soloConSaldo: false };

function VentasTab({ ventas, onAdd, onDelete, onUpdateFechaPago, onUpdateFechaEntrega, onUpdateAbono }) {
  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(VENTAS_FILTROS_VACIOS);
  const [form, setForm] = useState({ nombreProducto: "", cantidad: "1", precioVenta: "", cliente: "", fechaEntrega: today(), fechaPago: "", abono: "", metodoPago: "Efectivo" });

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
    setForm({ nombreProducto: "", cantidad: "1", precioVenta: "", cliente: "", fechaEntrega: today(), fechaPago: "", abono: "", metodoPago: "Efectivo" });
    setShowForm(false);
  }

  const filtrosActivos =
    filters.cliente.trim() !== "" || filters.producto.trim() !== "" || filters.fechaPago !== "" || filters.soloConSaldo;

  const filtered = ventas.filter((v) => {
    if (filters.cliente.trim() && !(v.cliente || "").toLowerCase().includes(filters.cliente.trim().toLowerCase())) return false;
    if (filters.producto.trim() && !(v.nombre_producto || "").toLowerCase().includes(filters.producto.trim().toLowerCase())) return false;
    if (filters.fechaPago && v.fecha_pago !== filters.fechaPago) return false;
    if (filters.soloConSaldo && !((Number(v.saldo) || 0) > 0)) return false;
    return true;
  });

  const sorted = [...filtered];

  return (
    <div>
      <div style={styles.statRow}>
        <StatCard label="Ventas registradas" value={ventas.length} />
        <StatCard label="Total vendido" value={fmt(totalAbonos)} />
        <StatCard label="Saldo por cobrar" value={fmt(totalSaldo)} accent />
      </div>

      <div style={styles.toolbar}>
        <button style={{ ...styles.ghostBtn, ...(filtrosActivos ? styles.ghostBtnActive : {}) }} onClick={() => setShowFilters((s) => !s)}>
          <SlidersHorizontal size={15} /> Filtros{filtrosActivos ? " •" : ""}
        </button>
        <button style={styles.primaryBtn} onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Registrar venta</button>
      </div>

      {showFilters && (
        <div style={styles.card}>
          <div style={styles.formGrid}>
            <Field label="Cliente">
              <input style={styles.input} value={filters.cliente} onChange={(e) => setFilters({ ...filters, cliente: e.target.value })} placeholder="Buscar por cliente…" />
            </Field>
            <Field label="Producto">
              <input style={styles.input} value={filters.producto} onChange={(e) => setFilters({ ...filters, producto: e.target.value })} placeholder="Buscar por producto…" />
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
            <Field label="Cliente">
              <input style={styles.input} value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} />
            </Field>
            <Field label="Fecha de entrega">
              <input type="date" style={styles.input} value={form.fechaEntrega} onChange={(e) => setForm({ ...form, fechaEntrega: e.target.value })} />
            </Field>
            <Field label="Fecha de pago">
              <input type="date" style={styles.input} value={form.fechaPago} onChange={(e) => setForm({ ...form, fechaPago: e.target.value })} />
            </Field>
            <Field label="Abono recibido">
              <input type="number" min="0" style={styles.input} value={form.abono} onChange={(e) => setForm({ ...form, abono: e.target.value })} />
            </Field>
            <Field label="Método de pago">
              <select style={styles.input} value={form.metodoPago} onChange={(e) => setForm({ ...form, metodoPago: e.target.value })}>
                <option>Efectivo</option><option>Nequi</option><option>Daviplata</option><option>Transferencia</option><option>Tarjeta</option>
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
                <td style={styles.td}><strong>{v.nombre_producto || "—"}</strong></td>
                <td style={styles.td}>{v.cantidad}</td>
                <td style={styles.tdMuted}>{v.cliente || "—"}</td>
                <td style={styles.td}>{fmt(v.valor_total)}</td>
                <td style={styles.td}>
                  <FechaPagoInput value={v.fecha_entrega} onSave={(nueva) => onUpdateFechaEntrega(v.id, nueva)} />
                </td>
                <td style={styles.td}>
                  <FechaPagoInput value={v.fecha_pago} onSave={(nueva) => onUpdateFechaPago(v.id, nueva)} />
                </td>
                <td style={styles.td}>
                  {Number(v.saldo) !== 0 ? (
                    <PrecioVentaInput value={v.abono} onSave={(nuevo) => onUpdateAbono(v.id, nuevo)} />
                  ) : (
                    fmt(v.abono)
                  )}
                </td>
                <td style={styles.td}><span style={{ ...styles.stockPill, ...(v.saldo > 0 ? styles.stockLow : {}) }}>{fmt(v.saldo)}</span></td>
                <td style={styles.tdMuted}>{v.metodo_pago}</td>
                <td style={styles.td}><button style={styles.iconBtn} onClick={() => onDelete(v.id)} title="Eliminar venta"><Trash2 size={15} /></button></td>
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
