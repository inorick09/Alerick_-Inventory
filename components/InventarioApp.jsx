"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Package, ShoppingCart, TrendingUp, Plus, Trash2, Search, Sparkles, AlertCircle, AlertTriangle, SlidersHorizontal, Wallet, ClipboardList, Download, Upload, Loader2, X } from "lucide-react";
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

const QUIEN_PAGO_OPCIONES = ["Erick", "Aleja", "Nequi"];

const UBICACION_OPCIONES = ["Aleja", "Erik"];

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
  const [abonos, setAbonos] = useState([]);
  const [pagosPendientes, setPagosPendientes] = useState([]);
  const [porComprar, setPorComprar] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAll = useCallback(async () => {
    const [p, c, v, ab, pp, pc, cl] = await Promise.all([
      fetchAllRows((from, to) => supabase.from("productos").select("*").order("nombre").range(from, to)),
      fetchAllRows((from, to) => supabase.from("compras").select("*").order("fecha", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("ventas").select("*").order("fecha_entrega", { ascending: false, nullsFirst: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("abonos_venta").select("*").order("fecha", { ascending: true }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("pagos_pendientes").select("*").order("fecha", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("por_comprar").select("*").order("created_at", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("clientes").select("*").order("nombre").range(from, to)),
    ]);
    if (p.error || c.error || v.error || ab.error || pp.error || pc.error || cl.error) {
      setError("No se pudo conectar con la base de datos. Revisa la configuración de Supabase.");
      return;
    }
    setError("");
    setProductos(p.data || []);
    setCompras(c.data || []);
    setVentas(v.data || []);
    setAbonos(ab.data || []);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "abonos_venta" }, fetchAll)
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
      nombre: p.nombre, sku: p.sku, cantidad: p.cantidad, costo: p.costo,
      "Ubicación": p.ubicacion || null,
    });
    if (error) setError("No se pudo guardar el producto.");
    else fetchAll();
  }
  async function deleteProducto(id) {
    const { error } = await supabase.from("productos").delete().eq("id", id);
    if (error) setError("No se pudo eliminar el producto.");
  }
  async function updateProducto(id, patch) {
    setProductos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const { error } = await supabase.from("productos").update(patch).eq("id", id);
    if (error) {
      setError("No se pudo actualizar el producto.");
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
  // Inserta en un solo lote todas las líneas de una factura ya parseada (ver
  // ImportarFacturaPanel más abajo). No toca la tabla "productos": igual que al
  // registrar una compra manual, la existencia y el stock del catálogo se siguen
  // gestionando aparte en la pestaña Inventario.
  async function importCompras(filas) {
    if (!filas || filas.length === 0) return { ok: false, error: "Sin filas para importar." };
    const { error } = await supabase.from("compras").insert(filas);
    if (error) {
      setError("No se pudieron importar las compras de la factura.");
      return { ok: false, error };
    }
    await fetchAll();
    return { ok: true };
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
  // abono/saldo/fecha_pago de una venta ya no se escriben directamente: se
  // calculan solos en la base de datos (trigger fn_recalcular_venta_pago) a
  // partir de las filas de abonos_venta. Por eso al crear una venta con un
  // abono inicial, ese abono se guarda como el primer registro en
  // abonos_venta en lugar de escribirse en las columnas de ventas.
  async function addVenta(v) {
    const { data, error } = await supabase
      .from("ventas")
      .insert({
        nombre_producto: v.nombreProducto, cantidad: v.cantidad, precio_venta: v.precioVenta, valor_total: v.valorTotal,
        cliente: v.cliente, fecha_entrega: v.fechaEntrega || null, metodo_pago: v.metodoPago,
      })
      .select()
      .single();
    if (error) {
      setError("No se pudo guardar la venta.");
      return;
    }
    if (Number(v.abono) > 0) {
      const { error: abonoError } = await supabase.from("abonos_venta").insert({
        venta_id: data.id,
        fecha: v.fechaPago || v.fechaEntrega || today(),
        monto: Number(v.abono),
        metodo_pago: v.metodoPago,
      });
      if (abonoError) setError("La venta se guardó, pero no se pudo registrar el abono inicial.");
    }
    fetchAll();
  }
  // Registra una venta a partir de un producto de inventario y descuenta la
  // cantidad vendida del stock. Los datos que faltan (cliente, precio de
  // venta, etc.) los pide el modal MoverAVentaModal antes de llegar aquí.
  async function moverProductoAVenta(producto, datos) {
    await addVenta({
      nombreProducto: producto.nombre,
      cantidad: datos.cantidad,
      precioVenta: datos.precioVenta,
      valorTotal: datos.cantidad * datos.precioVenta,
      cliente: datos.cliente,
      fechaEntrega: datos.fechaEntrega,
      fechaPago: datos.fechaPago,
      abono: datos.abono,
      metodoPago: datos.metodoPago,
    });
    const restante = Math.max((Number(producto.cantidad) || 0) - datos.cantidad, 0);
    await updateProducto(producto.id, { cantidad: restante });
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
  async function updateFechaEntrega(id, fechaEntrega) {
    setVentas((prev) => prev.map((v) => (v.id === id ? { ...v, fecha_entrega: fechaEntrega || null } : v)));
    const { error } = await supabase.from("ventas").update({ fecha_entrega: fechaEntrega || null }).eq("id", id);
    if (error) {
      setError("No se pudo actualizar la fecha de entrega.");
      fetchAll();
    }
  }
  // Historial de abonos por venta (una clienta puede abonar en varias
  // fechas). Cada insert/update/delete aquí hace que el trigger de Supabase
  // recalcule abono/saldo/fecha_pago de la venta correspondiente.
  async function addAbono(ventaId, { fecha, monto, metodoPago }) {
    const { error } = await supabase.from("abonos_venta").insert({
      venta_id: ventaId, fecha: fecha || today(), monto: Number(monto) || 0, metodo_pago: metodoPago || null,
    });
    if (error) setError("No se pudo registrar el abono.");
    else fetchAll();
  }
  async function updateAbonoEntry(id, patch) {
    const { error } = await supabase.from("abonos_venta").update(patch).eq("id", id);
    if (error) {
      setError("No se pudo actualizar el abono.");
    }
    fetchAll();
  }
  async function deleteAbonoEntry(id) {
    const { error } = await supabase.from("abonos_venta").delete().eq("id", id);
    if (error) setError("No se pudo eliminar el abono.");
    else fetchAll();
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
          <InventarioTab productos={productos} clientes={clientes} onAdd={addProducto} onDelete={deleteProducto} onUpdate={updateProducto} onMoverAVentas={moverProductoAVenta} />
        )}
        {tab === "compras" && (
          <ComprasTab productos={productos} compras={compras} onAdd={addCompra} onDelete={deleteCompra} onUpdate={updateCompra} onImportMany={importCompras} />
        )}
        {tab === "ventas" && (
          <VentasTab
            ventas={ventas}
            abonos={abonos}
            clientes={clientes}
            onAdd={addVenta}
            onDelete={deleteVenta}
            onUpdate={updateVenta}
            onUpdateFechaEntrega={updateFechaEntrega}
            onAddAbono={addAbono}
            onUpdateAbono={updateAbonoEntry}
            onDeleteAbono={deleteAbonoEntry}
          />
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
const PAGE_SIZE = 10;

function InventarioTab({ productos, clientes, onAdd, onDelete, onUpdate, onMoverAVentas }) {
  const [query, setQuery] = useState("");
  const [ubicacionFiltro, setUbicacionFiltro] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", sku: "", cantidad: "", costo: "", ubicacion: "" });
  const [moviendo, setMoviendo] = useState(null);

  const hayFiltrosActivos = query.trim() !== "" || ubicacionFiltro !== "";

  // Si el usuario cambia el texto de búsqueda o la ubicación, siempre volvemos
  // a la primera página para no quedar "perdidos" en una página vacía.
  useEffect(() => {
    setPage(1);
  }, [query, ubicacionFiltro]);

  const filtered = productos
    .filter((p) => p.nombre.toLowerCase().includes(query.toLowerCase()) || (p.sku || "").toLowerCase().includes(query.toLowerCase()))
    .filter((p) => !ubicacionFiltro || (p["Ubicación"] || "").split(",").map((s) => s.trim()).includes(ubicacionFiltro))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  // Sin filtros mostramos solo 10 a la vez (paginado) para no cargar la tabla
  // completa; en cuanto haya una búsqueda o un filtro de ubicación activo,
  // mostramos todos los resultados que coincidan, sin paginar.
  const totalPaginas = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginaActual = Math.min(page, totalPaginas);
  const visibles = hayFiltrosActivos
    ? filtered
    : filtered.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  const totalUnidades = productos.reduce((s, p) => s + (Number(p.cantidad) || 0), 0);
  const valorInventario = productos.reduce((s, p) => s + (Number(p.cantidad) || 0) * (Number(p.costo) || 0), 0);
  const bajoStock = productos.filter((p) => (Number(p.cantidad) || 0) <= 2 && (Number(p.cantidad) || 0) >= 0).length;

  function submit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    onAdd({ nombre: form.nombre.trim(), sku: form.sku.trim(), cantidad: Number(form.cantidad) || 0, costo: Number(form.costo) || 0, ubicacion: form.ubicacion });
    setForm({ nombre: "", sku: "", cantidad: "", costo: "", ubicacion: "" });
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
        <select style={{ ...styles.input, width: 160 }} value={ubicacionFiltro} onChange={(e) => setUbicacionFiltro(e.target.value)}>
          <option value="">Todas las ubicaciones</option>
          {UBICACION_OPCIONES.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
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
            <Field label="Cantidad *">
              <input type="number" min="0" style={styles.input} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} required />
            </Field>
            <Field label="Costo (compra) c/u *">
              <input type="number" min="0" style={styles.input} value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} required />
            </Field>
            <Field label="Ubicación">
              <select style={styles.input} value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}>
                <option value="">Selecciona…</option>
                {UBICACION_OPCIONES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
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
              <th style={styles.th}>Producto</th><th style={styles.th}>SKU</th>
              <th style={styles.th}>Cantidad</th><th style={styles.th}>Costo</th>
              <th style={styles.th}>Ubicación</th><th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr><td colSpan={6} style={styles.emptyCell}>
                {filtered.length === 0 && productos.length > 0 ? "Ningún producto coincide con la búsqueda o la ubicación seleccionada." : "Aún no hay productos que coincidan. Agrega el primero arriba."}
              </td></tr>
            )}
            {visibles.map((p) => {
              const cantidad = Number(p.cantidad) || 0;
              return (
                <tr key={p.id}>
                  <td style={styles.td}>
                    <TextCellInput value={p.nombre} onSave={(nuevo) => onUpdate(p.id, { nombre: nuevo })} width={180} />
                  </td>
                  <td style={styles.tdMuted}>
                    <TextCellInput value={p.sku} onSave={(nuevo) => onUpdate(p.id, { sku: nuevo })} width={100} />
                  </td>
                  <td style={styles.td}>
                    <CantidadInput value={p.cantidad} onSave={(nueva) => onUpdate(p.id, { cantidad: nueva })} low={cantidad <= 2} />
                  </td>
                  <td style={styles.td}>
                    <MoneyCellInput value={p.costo} onSave={(nuevo) => onUpdate(p.id, { costo: nuevo })} />
                  </td>
                  <td style={styles.td}>
                    <UbicacionSelect value={p["Ubicación"]} onSave={(nuevo) => onUpdate(p.id, { "Ubicación": nuevo })} />
                  </td>
                  <td style={styles.td}>
                    <button style={styles.iconBtn} onClick={() => setMoviendo(p)} title="Mover a ventas"><TrendingUp size={15} /></button>
                    <button style={styles.iconBtn} onClick={() => onDelete(p.id)} title="Eliminar producto"><Trash2 size={15} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!hayFiltrosActivos && filtered.length > 0 && (
        <div style={styles.paginationBar}>
          <span style={styles.paginationInfo}>
            Mostrando {(paginaActual - 1) * PAGE_SIZE + 1}
            –{Math.min(paginaActual * PAGE_SIZE, filtered.length)} de {filtered.length} productos
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              style={{ ...styles.ghostBtn, opacity: paginaActual <= 1 ? 0.5 : 1 }}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={paginaActual <= 1}
            >
              Anterior
            </button>
            <span style={styles.paginationInfo}>Página {paginaActual} de {totalPaginas}</span>
            <button
              type="button"
              style={{ ...styles.ghostBtn, opacity: paginaActual >= totalPaginas ? 0.5 : 1 }}
              onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaActual >= totalPaginas}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
      {hayFiltrosActivos && filtered.length > 0 && (
        <div style={styles.paginationBar}>
          <span style={styles.paginationInfo}>{filtered.length} producto{filtered.length === 1 ? "" : "s"} encontrado{filtered.length === 1 ? "" : "s"}</span>
        </div>
      )}

      {moviendo && (
        <MoverAVentaModal
          producto={moviendo}
          clientes={clientes}
          onClose={() => setMoviendo(null)}
          onConfirm={async (datos) => {
            await onMoverAVentas(moviendo, datos);
            setMoviendo(null);
          }}
        />
      )}
    </div>
  );
}

function MoverAVentaModal({ producto, clientes, onClose, onConfirm }) {
  const [form, setForm] = useState({
    cantidad: String(Number(producto.cantidad) || 1),
    precioVenta: "",
    cliente: "",
    fechaEntrega: "",
    fechaPago: "",
    abono: "",
    metodoPago: METODO_PAGO_OPCIONES[0],
  });
  const [submitting, setSubmitting] = useState(false);

  const disponible = Number(producto.cantidad) || 0;

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm({
        cantidad: Number(form.cantidad) || 0,
        precioVenta: Number(form.precioVenta) || 0,
        cliente: form.cliente.trim(),
        fechaEntrega: form.fechaEntrega,
        fechaPago: form.fechaPago,
        abono: Number(form.abono) || 0,
        metodoPago: form.metodoPago,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ ...styles.sectionTitle, margin: 0 }}>Mover a ventas</h3>
          <button type="button" style={styles.iconBtn} onClick={onClose} title="Cerrar"><X size={16} /></button>
        </div>
        <p style={{ fontSize: 13, color: "#8B6B76", margin: "0 0 16px" }}>
          <strong>{producto.nombre}</strong> · Disponible en inventario: {disponible}
        </p>
        <form onSubmit={submit}>
          <div style={styles.formGrid}>
            <Field label="Cantidad a vender *">
              <input
                type="number" min="1" max={disponible || undefined} style={styles.input}
                value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} required
              />
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
            <button type="button" style={styles.ghostBtn} onClick={onClose}>Cancelar</button>
            <button type="submit" style={styles.primaryBtn} disabled={submitting}>{submitting ? "Guardando…" : "Confirmar venta"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------- COMPRAS ---------------- */
function ComprasTab({ productos, compras, onAdd, onDelete, onUpdate, onImportMany }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombreProducto: "", sku: "", cantidad: "1", valorUnitario: "", fecha: today(), quienPago: "", factura: "" });
  const [facturaFiltro, setFacturaFiltro] = useState("");

  // ---- Importar factura en PDF ----
  const fileInputRef = useRef(null);
  const [cargandoPdf, setCargandoPdf] = useState(false);
  const [errorPdf, setErrorPdf] = useState("");
  const [previewFactura, setPreviewFactura] = useState(null); // { factura, fecha, proveedor, quienPago, totalFactura, sumaItems, advertencias, items: [...] }
  const [importando, setImportando] = useState(false);

  async function handleFacturaFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo si hace falta reintentar
    if (!file) return;
    setErrorPdf("");
    setCargandoPdf(true);
    try {
      const fd = new FormData();
      fd.append("factura", file);
      const res = await fetch("/api/parse-factura", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo procesar la factura.");
      setPreviewFactura({
        factura: data.factura || "",
        fecha: data.fecha || today(),
        proveedor: data.proveedor || "",
        quienPago: "",
        totalFactura: data.totalFactura,
        sumaItems: data.sumaItems,
        advertencias: data.advertencias || [],
        items: (data.items || []).map((it, i) => ({ ...it, _id: i, incluir: true })),
      });
    } catch (err) {
      setErrorPdf(err.message || "No se pudo leer el PDF.");
    } finally {
      setCargandoPdf(false);
    }
  }

  function actualizarItemPreview(id, patch) {
    setPreviewFactura((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it._id === id ? { ...it, ...patch } : it)),
    }));
  }
  function eliminarItemPreview(id) {
    setPreviewFactura((prev) => ({ ...prev, items: prev.items.filter((it) => it._id !== id) }));
  }
  function cancelarImportacion() {
    setPreviewFactura(null);
    setErrorPdf("");
  }

  const facturaYaExiste = previewFactura && compras.some((c) => (c.factura || "").trim() === previewFactura.factura.trim() && previewFactura.factura.trim() !== "");

  async function confirmarImportacion() {
    if (!previewFactura.quienPago) return;
    const incluidos = previewFactura.items.filter((it) => it.incluir);
    if (incluidos.length === 0) return;
    setImportando(true);
    const filas = incluidos.map((it) => {
      const cantidad = Number(it.cantidad) || 0;
      const valorUnitario = Number(it.valorUnitario) || 0;
      return {
        producto_id: null,
        nombre_producto: it.descripcion,
        sku: it.sku,
        cantidad,
        valor_unitario: valorUnitario,
        valor_total: cantidad * valorUnitario,
        fecha: previewFactura.fecha,
        quien_pago: previewFactura.quienPago,
        factura: previewFactura.factura.trim(),
      };
    });
    const resultado = await onImportMany(filas);
    setImportando(false);
    if (resultado?.ok) setPreviewFactura(null);
  }

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
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: "none" }}
            onChange={handleFacturaFile}
          />
          <button
            style={styles.ghostBtn}
            disabled={cargandoPdf}
            onClick={() => fileInputRef.current?.click()}
          >
            {cargandoPdf ? <Loader2 size={16} /> : <Upload size={16} />}
            {cargandoPdf ? "Leyendo factura…" : "Importar factura (PDF)"}
          </button>
          <button style={styles.primaryBtn} onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Registrar compra</button>
        </div>
      </div>

      {errorPdf && (
        <div style={{ ...styles.errorBanner, margin: "0 0 16px" }}>
          <AlertCircle size={16} /><span>{errorPdf}</span>
        </div>
      )}

      {previewFactura && (
        <div style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h3 style={{ ...styles.sectionTitle, margin: 0 }}>
              Revisar factura importada{previewFactura.proveedor ? ` · ${previewFactura.proveedor}` : ""}
            </h3>
            <button style={styles.iconBtn} onClick={cancelarImportacion} title="Cancelar importación"><X size={18} /></button>
          </div>

          {previewFactura.advertencias.length > 0 && (
            <div style={{ ...styles.errorBanner, alignItems: "flex-start", flexDirection: "column", gap: 4, marginBottom: 14 }}>
              {previewFactura.advertencias.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>{a}</span>
                </div>
              ))}
            </div>
          )}
          {facturaYaExiste && (
            <div style={{ ...styles.errorBanner, marginBottom: 14 }}>
              <AlertTriangle size={16} />
              <span>Ya existen compras registradas con la factura "{previewFactura.factura}". Si continúas, se agregarán líneas adicionales (no se borran las existentes).</span>
            </div>
          )}

          <div style={styles.formGrid}>
            <Field label="N.º de factura *">
              <input style={styles.input} value={previewFactura.factura} onChange={(e) => setPreviewFactura({ ...previewFactura, factura: e.target.value })} required />
            </Field>
            <Field label="Fecha de compra *">
              <input type="date" style={styles.input} value={previewFactura.fecha} onChange={(e) => setPreviewFactura({ ...previewFactura, fecha: e.target.value })} required />
            </Field>
            <Field label="Quién pagó *">
              <select style={styles.input} value={previewFactura.quienPago} onChange={(e) => setPreviewFactura({ ...previewFactura, quienPago: e.target.value })} required>
                <option value="">Selecciona…</option>
                {QUIEN_PAGO_OPCIONES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ ...styles.tableWrap, marginTop: 16 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}></th>
                  <th style={styles.th}>Producto</th>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>Cant.</th>
                  <th style={styles.th}>Valor unit.</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {previewFactura.items.length === 0 && (
                  <tr><td colSpan={7} style={styles.emptyCell}>No se detectaron productos en el PDF.</td></tr>
                )}
                {previewFactura.items.map((it) => (
                  <tr key={it._id} style={!it.incluir ? { opacity: 0.45 } : undefined}>
                    <td style={styles.td}>
                      <input type="checkbox" checked={it.incluir} onChange={(e) => actualizarItemPreview(it._id, { incluir: e.target.checked })} />
                    </td>
                    <td style={styles.td}>
                      <input style={{ ...styles.input, minWidth: 200 }} value={it.descripcion} onChange={(e) => actualizarItemPreview(it._id, { descripcion: e.target.value })} />
                    </td>
                    <td style={styles.td}>
                      <input style={{ ...styles.input, width: 100 }} value={it.sku} onChange={(e) => actualizarItemPreview(it._id, { sku: e.target.value })} />
                    </td>
                    <td style={styles.td}>
                      <input type="number" min="0" style={{ ...styles.input, width: 70 }} value={it.cantidad} onChange={(e) => actualizarItemPreview(it._id, { cantidad: e.target.value })} />
                    </td>
                    <td style={styles.td}>
                      <input type="number" min="0" style={{ ...styles.input, width: 100 }} value={it.valorUnitario} onChange={(e) => actualizarItemPreview(it._id, { valorUnitario: e.target.value })} />
                    </td>
                    <td style={styles.td}>{fmt((Number(it.cantidad) || 0) * (Number(it.valorUnitario) || 0))}</td>
                    <td style={styles.td}>
                      <button style={styles.iconBtn} onClick={() => eliminarItemPreview(it._id)} title="Quitar línea"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={styles.formActions}>
            <span style={{ ...styles.paginationInfo, marginRight: "auto" }}>
              {previewFactura.items.filter((it) => it.incluir).length} de {previewFactura.items.length} productos seleccionados
              {" · "}Total: {fmt(previewFactura.items.filter((it) => it.incluir).reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.valorUnitario) || 0), 0))}
            </span>
            <button type="button" style={styles.ghostBtn} onClick={cancelarImportacion}>Cancelar</button>
            <button
              type="button"
              style={styles.primaryBtn}
              disabled={importando || !previewFactura.quienPago || !previewFactura.factura.trim() || previewFactura.items.filter((it) => it.incluir).length === 0}
              onClick={confirmarImportacion}
            >
              {importando ? "Importando…" : `Importar ${previewFactura.items.filter((it) => it.incluir).length} compras`}
            </button>
          </div>
        </div>
      )}

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

function VentasTab({ ventas, abonos, clientes, onAdd, onDelete, onUpdate, onUpdateFechaEntrega, onAddAbono, onUpdateAbono, onDeleteAbono }) {
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

  // Editar el total a mano no pasa por abonos_venta, así que replicamos aquí
  // la misma regla del trigger de Supabase (saldo y fecha_pago a partir de
  // lo ya abonado) para que quede consistente sin esperar un refresh.
  function updateValorTotalVenta(v, nuevoTotal) {
    const total = Number(nuevoTotal) || 0;
    const abonosVenta = abonos.filter((a) => a.venta_id === v.id);
    const totalAbonado = abonosVenta.reduce((s, a) => s + Number(a.monto || 0), 0);
    const ultimaFecha = abonosVenta.reduce((max, a) => (a.fecha && (!max || a.fecha > max) ? a.fecha : max), null);
    const saldo = Math.max(total - totalAbonado, 0);
    const fechaPago = total > 0 && totalAbonado >= total ? ultimaFecha : null;
    onUpdate(v.id, { valor_total: total, saldo, fecha_pago: fechaPago });
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

  const pendientesPorEntregar = [...ventas]
    .filter((v) => !v.fecha_entrega)
    .sort((a, b) => (a.cliente || "").localeCompare(b.cliente || "") || (b.fecha_pago || "").localeCompare(a.fecha_pago || ""));

  const pendientesAgrupados = [];
  {
    const map = new Map();
    for (const v of pendientesPorEntregar) {
      const key = v.cliente || "Sin cliente";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(v);
    }
    for (const [cliente, itemsCliente] of map) pendientesAgrupados.push({ cliente, items: itemsCliente });
  }

  const sorted = filtrosActivos ? filtered : pendientesPorEntregar;

  const abonoFiltrado = filtered.reduce((s, v) => s + Number(v.abono || 0), 0);
  const saldoFiltrado = filtered.reduce((s, v) => s + Number(v.saldo || 0), 0);

  function renderVentaRow(v) {
    return (
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
          <span style={{ ...styles.stockPill, ...(v.fecha_pago ? {} : styles.stockLow) }}>
            {v.fecha_pago ? fmtDate(v.fecha_pago) : "Pendiente"}
          </span>
        </td>
        <td style={styles.td}>
          <AbonosCell
            venta={v}
            abonos={abonos.filter((a) => a.venta_id === v.id)}
            onAdd={onAddAbono}
            onUpdate={onUpdateAbono}
            onDelete={onDeleteAbono}
          />
        </td>
        <td style={styles.td}><span style={{ ...styles.stockPill, ...(v.saldo > 0 ? styles.stockLow : {}) }}>{fmt(v.saldo)}</span></td>
        <td style={styles.td}>
          <MetodoPagoSelect value={v.metodo_pago} onSave={(nuevo) => onUpdate(v.id, { metodo_pago: nuevo })} />
        </td>
        <td style={styles.td}><button style={styles.iconBtn} onClick={() => onDelete(v.id)} title="Eliminar venta"><Trash2 size={15} /></button></td>
      </tr>
    );
  }

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
            }, filters.cliente.trim())
          }
        >
          <Download size={15} /> Exportar PNG
        </button>
      </div>

      {!filtrosActivos && (
        <p style={{ fontSize: 12.5, color: "#8B6B76", margin: "-6px 0 14px" }}>
          Mostrando productos pendientes por entregar (sin fecha de entrega), agrupados por cliente. Usa los filtros para ver el resto de las ventas.
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
            <Field label="Fecha del abono inicial">
              <input type="date" style={styles.input} value={form.fechaPago} onChange={(e) => setForm({ ...form, fechaPago: e.target.value })} />
            </Field>
            <Field label="Abono inicial">
              <input type="number" min="0" style={styles.input} value={form.abono} onChange={(e) => setForm({ ...form, abono: e.target.value })} />
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
            {!filtrosActivos ? (
              pendientesAgrupados.length === 0 ? (
                <tr><td colSpan={10} style={styles.emptyCell}>No hay productos pendientes por entregar.</td></tr>
              ) : (
                pendientesAgrupados.map((g) => (
                  <Fragment key={g.cliente}>
                    <tr>
                      <td colSpan={10} style={{ ...styles.td, fontWeight: 700, background: "#FBEFF2" }}>{g.cliente}</td>
                    </tr>
                    {g.items.map((v) => renderVentaRow(v))}
                  </Fragment>
                ))
              )
            ) : sorted.length === 0 ? (
              <tr><td colSpan={10} style={styles.emptyCell}>Ningún resultado coincide con los filtros.</td></tr>
            ) : (
              sorted.map((v) => renderVentaRow(v))
            )}
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

function exportVentasPNG(rows, resumen, clienteFiltro) {
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
  ];
  const padding = 24;
  const rowHeight = 30;
  const headerHeight = 34;
  const titleHeight = 46;
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
  ctx.fillText(`Saldo: ${fmt(resumen.totalSaldo)}${clienteFiltro ? ` — ${clienteFiltro}` : ""}`, padding, 30);

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

const PORCOMPRAR_FILTROS_VACIOS = { producto: "", sku: "", cliente: "", status: "" };

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
  const [page, setPage] = useState(1);

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

  const filtrosActivos = filters.producto.trim() !== "" || filters.sku.trim() !== "" || filters.cliente.trim() !== "" || filters.status !== "";

  // Al cambiar cualquier filtro, volvemos a la primera página.
  useEffect(() => {
    setPage(1);
  }, [filters.producto, filters.sku, filters.cliente, filters.status]);

  const sorted = items.filter((pc) => {
    if (filters.producto.trim() && !(pc.producto || "").toLowerCase().includes(filters.producto.trim().toLowerCase())) return false;
    if (filters.sku.trim() && !(pc.sku || "").toLowerCase().includes(filters.sku.trim().toLowerCase())) return false;
    if (filters.cliente.trim() && !(pc.cliente || "").toLowerCase().includes(filters.cliente.trim().toLowerCase())) return false;
    if (filters.status && pc.status !== filters.status) return false;
    return true;
  });

  // Sin filtros activos mostramos solo 10 registros a la vez (paginado); en
  // cuanto se aplique cualquier filtro, mostramos todos los que coincidan.
  const totalPaginas = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginaActual = Math.min(page, totalPaginas);
  const visibles = filtrosActivos
    ? sorted
    : sorted.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

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
            <Field label="Producto">
              <input style={styles.input} value={filters.producto} onChange={(e) => setFilters({ ...filters, producto: e.target.value })} placeholder="Buscar por producto…" />
            </Field>
            <Field label="SKU">
              <input style={styles.input} value={filters.sku} onChange={(e) => setFilters({ ...filters, sku: e.target.value })} placeholder="Buscar por SKU…" />
            </Field>
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
            {visibles.length === 0 && <tr><td colSpan={7} style={styles.emptyCell}>{filtrosActivos ? "Ningún resultado coincide con los filtros." : "Aún no has registrado productos por comprar."}</td></tr>}
            {visibles.map((pc) => (
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

      {!filtrosActivos && sorted.length > 0 && (
        <div style={styles.paginationBar}>
          <span style={styles.paginationInfo}>
            Mostrando {(paginaActual - 1) * PAGE_SIZE + 1}
            –{Math.min(paginaActual * PAGE_SIZE, sorted.length)} de {sorted.length} registros
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              style={{ ...styles.ghostBtn, opacity: paginaActual <= 1 ? 0.5 : 1 }}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={paginaActual <= 1}
            >
              Anterior
            </button>
            <span style={styles.paginationInfo}>Página {paginaActual} de {totalPaginas}</span>
            <button
              type="button"
              style={{ ...styles.ghostBtn, opacity: paginaActual >= totalPaginas ? 0.5 : 1 }}
              onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaActual >= totalPaginas}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
      {filtrosActivos && sorted.length > 0 && (
        <div style={styles.paginationBar}>
          <span style={styles.paginationInfo}>{sorted.length} registro{sorted.length === 1 ? "" : "s"} encontrado{sorted.length === 1 ? "" : "s"}</span>
        </div>
      )}
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
// Muestra el total abonado de una venta y, al hacer clic, despliega el
// historial de abonos (fecha + monto) de esa venta: se pueden agregar,
// editar o borrar. abono/saldo/fecha_pago de la venta los recalcula solo el
// trigger de Supabase apenas cambia algo aquí.
function AbonosCell({ venta, abonos, onAdd, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState(today());
  const [nuevoMonto, setNuevoMonto] = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const ordenados = [...abonos].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));

  function submitAbono(e) {
    e.preventDefault();
    const monto = Number(nuevoMonto) || 0;
    if (monto <= 0) return;
    onAdd(venta.id, { fecha: nuevaFecha, monto });
    setNuevoMonto("");
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button type="button" style={styles.abonoBtn} onClick={() => setOpen((o) => !o)} title="Ver / agregar abonos">
        {fmt(venta.abono)}
        {ordenados.length > 1 ? <span style={styles.abonoCount}>{ordenados.length}</span> : null}
      </button>
      {open && (
        <div style={styles.abonoPopover} onClick={(e) => e.stopPropagation()}>
          <div style={styles.abonoPopoverHeader}>
            <strong style={{ fontSize: 12.5 }}>Abonos de {venta.cliente || "esta venta"}</strong>
            <button type="button" style={styles.iconBtn} onClick={() => setOpen(false)}><X size={14} /></button>
          </div>

          {ordenados.length === 0 ? (
            <p style={{ fontSize: 12, color: "#8B6B76", margin: "4px 0 10px" }}>Sin abonos registrados.</p>
          ) : (
            <ul style={styles.abonoList}>
              {ordenados.map((a) => (
                <li key={a.id} style={styles.abonoItem}>
                  <input
                    type="date"
                    style={styles.abonoDateInput}
                    defaultValue={a.fecha || ""}
                    onBlur={(e) => { if (e.target.value !== (a.fecha || "")) onUpdate(a.id, { fecha: e.target.value }); }}
                  />
                  <input
                    type="number"
                    min="0"
                    style={styles.abonoMoneyInput}
                    defaultValue={a.monto}
                    onBlur={(e) => {
                      const nuevo = Number(e.target.value) || 0;
                      if (nuevo !== Number(a.monto)) onUpdate(a.id, { monto: nuevo });
                    }}
                  />
                  <button type="button" style={styles.iconBtn} onClick={() => onDelete(a.id)} title="Eliminar abono">
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={submitAbono} style={styles.abonoForm}>
            <input type="date" style={styles.abonoDateInput} value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} required />
            <input
              type="number"
              min="0"
              placeholder="Monto"
              style={styles.abonoMoneyInput}
              value={nuevoMonto}
              onChange={(e) => setNuevoMonto(e.target.value)}
              required
            />
            <button type="submit" style={styles.abonoAddBtn} title="Agregar abono"><Plus size={14} /></button>
          </form>
        </div>
      )}
    </div>
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
// Lista desplegable para la ubicación del producto (Aleja / Erik). Si el valor
// actual no coincide con ninguna opción (p. ej. viene con ambas ubicaciones
// combinadas como "Aleja, Erik" de una importación anterior), se agrega igual
// como opción para no perder el dato hasta que se elija una de las dos.
function UbicacionSelect({ value, onSave }) {
  const opciones = value && !UBICACION_OPCIONES.includes(value) ? [value, ...UBICACION_OPCIONES] : UBICACION_OPCIONES;
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
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(59,42,51,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 },
  modalCard: { background: "#FFFFFF", borderRadius: 14, padding: 22, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(59,42,51,0.25)" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 },
  formActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  label: { fontSize: 12, color: "#8B6B76", fontWeight: 500 },
  input: { border: "1px solid #EEDEE0", borderRadius: 8, padding: "9px 10px", fontSize: 13.5, fontFamily: "'Poppins', sans-serif", background: "#fff", color: "#3B2A33", outline: "none", width: "100%", boxSizing: "border-box" },
  priceInput: { border: "1px solid #EEDEE0", borderRadius: 8, padding: "6px 8px", fontSize: 13, fontFamily: "'Poppins', sans-serif", background: "#fff", color: "#3B2A33", outline: "none", width: 110, boxSizing: "border-box" },
  priceInputLow: { borderColor: "#E7CFA0", background: "#FCF1DC", color: "#A9791F" },
  inlineRow: { display: "flex", gap: 8, alignItems: "center" },
  tableWrap: { overflowX: "auto", border: "1px solid #EEDEE0", borderRadius: 12 },
  paginationBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 10 },
  paginationInfo: { color: "#8B6B76", fontSize: 12.5 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "10px 14px", background: "#FBF3F1", color: "#8B6B76", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 600, borderBottom: "1px solid #EEDEE0" },
  td: { padding: "10px 14px", borderBottom: "1px solid #F4E9E9", color: "#3B2A33" },
  tdMuted: { padding: "10px 14px", borderBottom: "1px solid #F4E9E9", color: "#8B6B76" },
  emptyCell: { padding: "22px 14px", textAlign: "center", color: "#8B6B76", fontSize: 13 },
  pill: { background: "#F1E3E8", color: "#B84C71", padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 500 },
  stockPill: { background: "#EAF6F4", color: "#3F8F87", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  stockLow: { background: "#FCF1DC", color: "#A9791F" },
  iconBtn: { background: "transparent", border: "none", color: "#B89099", cursor: "pointer", padding: 6, borderRadius: 6 },
  abonoBtn: { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #EEDEE0", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "'Poppins', sans-serif", background: "#fff", color: "#3B2A33", cursor: "pointer" },
  abonoCount: { background: "#F1E3E8", color: "#B84C71", borderRadius: 20, padding: "1px 7px", fontSize: 11, fontWeight: 700 },
  abonoPopover: { position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 20, background: "#fff", border: "1px solid #EEDEE0", borderRadius: 10, padding: 12, width: 240, boxShadow: "0 8px 24px rgba(59,42,51,0.14)" },
  abonoPopoverHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, color: "#3B2A33" },
  abonoList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" },
  abonoItem: { display: "flex", alignItems: "center", gap: 6 },
  abonoDateInput: { border: "1px solid #EEDEE0", borderRadius: 7, padding: "5px 6px", fontSize: 12, fontFamily: "'Poppins', sans-serif", background: "#fff", color: "#3B2A33", outline: "none", width: 118, boxSizing: "border-box" },
  abonoMoneyInput: { border: "1px solid #EEDEE0", borderRadius: 7, padding: "5px 6px", fontSize: 12, fontFamily: "'Poppins', sans-serif", background: "#fff", color: "#3B2A33", outline: "none", width: 76, boxSizing: "border-box" },
  abonoForm: { display: "flex", alignItems: "center", gap: 6, marginTop: 8, paddingTop: 8, borderTop: "1px solid #F4E9E9" },
  abonoAddBtn: { display: "flex", alignItems: "center", justifyContent: "center", background: "#D9678C", color: "#fff", border: "none", borderRadius: 7, width: 28, height: 28, cursor: "pointer", flexShrink: 0 },
};
