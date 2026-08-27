import { NextResponse } from "next/server";
// Se usa "unpdf" (en vez de "pdf-parse") porque está pensado justo para leer
// PDFs dentro de funciones serverless como las de Vercel, sin necesidad de
// workers ni del paquete opcional "canvas". Además conserva los espacios
// entre palabras en este tipo de factura POS, algo que "pdf-parse" no hacía
// (su copia interna y antigua de pdf.js unía las palabras: "TRENDY SHOP"
// quedaba como "TRENDYSHOP").
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";

async function extraerTextoPdf(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

// ---------- utilidades de parseo de números ----------
// En este formato de factura las cantidades usan punto decimal (ej. "2.00")
// y los valores en pesos usan coma como separador de miles (ej. "3,500").
function parseCantidad(str) {
  return parseFloat(String(str).trim()) || 0;
}
function parseMoneda(str) {
  return Number(String(str).replace(/\*/g, "").replace(/,/g, "").trim()) || 0;
}

// ---------- extracción de encabezado ----------
function extraerFactura(texto) {
  let m = texto.match(/FACTURA\s+ELECTR[ÓO]NICA\s+DE\s+VENTA\s*:?\s*\n?\s*([A-Z]{1,6}\d{2,10})/i);
  if (m) return m[1].trim();
  m = texto.match(/FACTURA\s*(?:N[°ºo.]?\s*[:.]?)?\s*([A-Z]{1,6}\d{2,10})/i);
  return m ? m[1].trim() : "";
}

function extraerFecha(texto) {
  let m = texto.match(/Fecha\s*:\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  m = texto.match(/Fecha\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

function extraerProveedor(texto) {
  const primeraLinea = texto
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return primeraLinea || "";
}

function extraerTotalFactura(texto) {
  // Se busca línea por línea (en vez de un match sobre todo el texto) para no
  // confundir la palabra "Total" del encabezado de la tabla ("V/r Uni. Total")
  // con la línea real de total, que va sola y termina en el monto: "T O T A L
  // ............ $263,800". Anclar al final de línea evita ese falso positivo.
  const lineas = texto.split("\n").map((l) => l.trim());
  for (const linea of lineas) {
    const m = linea.match(/^T\s*O\s*T\s*A\s*L[\s.]*\$?\s*([\d.,]+)$/i);
    if (m) return parseMoneda(m[1]);
  }
  return null;
}

function extraerTotalItemsDeclarado(texto) {
  const m = texto.match(/TOTAL\s+ITEMS?\.*\s*([\d]+)/i);
  return m ? Number(m[1]) : null;
}

// ---------- extracción de líneas de producto ----------
// Cada ítem del formato TRENDY SHOP / POS de "Sistemas de Información Empresarial"
// ocupa varias líneas de descripción seguidas de una línea de datos con la forma:
//   SKU  CANTIDAD  UNIDAD  VALOR_UNITARIO  VALOR_TOTAL*
// Ejemplo real:
//   14 OJOS LAPIZ DE OJOS SAFARI DST2259
//   CAFE CLARO DST2259
//   DST2259 1.00 UND 1,800 1,800*
const RE_LINEA_ITEM = /^(\S+)\s+(\d+(?:[.,]\d+)?)\s+([A-Za-z]{1,4})\s+([\d.,]+)\s+([\d.,]+)\*?$/;

function extraerItems(texto) {
  const lineas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let inicio = lineas.findIndex((l) => /Referencia\s+Cant/i.test(l));
  let fin = lineas.findIndex((l) => /^T\s*O\s*T\s*A\s*L\b/i.test(l));
  if (inicio === -1) inicio = 0;
  else inicio += 1;
  if (fin === -1) fin = lineas.length;

  const bloque = lineas.slice(inicio, fin);
  const items = [];
  let descripcionActual = [];

  for (const linea of bloque) {
    if (/^-{3,}$/.test(linea)) continue; // línea separadora
    const m = linea.match(RE_LINEA_ITEM);
    if (m) {
      const [, sku, cantidadStr, , unitarioStr, totalStr] = m;
      let descripcion = descripcionActual.join(" ").trim();
      descripcion = descripcion.replace(/^\d+\s+/, ""); // quita el número de ítem inicial
      items.push({
        descripcion: descripcion || sku,
        sku,
        cantidad: parseCantidad(cantidadStr),
        valorUnitario: parseMoneda(unitarioStr),
        valorTotal: parseMoneda(totalStr),
      });
      descripcionActual = [];
    } else {
      descripcionActual.push(linea);
    }
  }
  return items;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("factura");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "No se recibió ningún archivo PDF." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const texto = await extraerTextoPdf(buffer);

    const factura = extraerFactura(texto);
    const fecha = extraerFecha(texto);
    const proveedor = extraerProveedor(texto);
    const totalFactura = extraerTotalFactura(texto);
    const totalItemsDeclarado = extraerTotalItemsDeclarado(texto);
    const items = extraerItems(texto);

    const sumaItems = items.reduce((s, it) => s + it.valorTotal, 0);

    const advertencias = [];
    if (items.length === 0) {
      advertencias.push("No se pudo detectar ningún producto en esta factura. Revisa el PDF o agrégalos manualmente.");
    }
    if (totalItemsDeclarado != null && totalItemsDeclarado !== items.length) {
      advertencias.push(
        `La factura indica ${totalItemsDeclarado} ítems pero se detectaron ${items.length}. Revisa el detalle antes de importar.`
      );
    }
    if (totalFactura != null && Math.abs(sumaItems - totalFactura) > 1) {
      advertencias.push(
        `La suma de los productos ($${sumaItems.toLocaleString("es-CO")}) no coincide con el total de la factura ($${totalFactura.toLocaleString("es-CO")}).`
      );
    }
    if (!factura) advertencias.push("No se detectó el número de factura automáticamente, ingrésalo manualmente.");
    if (!fecha) advertencias.push("No se detectó la fecha automáticamente, ingrésala manualmente.");

    return NextResponse.json({
      factura,
      fecha,
      proveedor,
      totalFactura,
      sumaItems,
      totalItemsDeclarado,
      items,
      advertencias,
    });
  } catch (err) {
    console.error("Error al procesar la factura:", err);
    return NextResponse.json(
      { error: "No se pudo leer el PDF. Verifica que el archivo sea una factura válida y vuelve a intentarlo." },
      { status: 500 }
    );
  }
}
