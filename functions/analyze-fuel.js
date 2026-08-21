const FUEL_TYPES = ["Gasolina 95", "Gasolina 98", "Diésel", "Diésel+", "GLP", "Eléctrico"];

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export async function onRequestPost(context) {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "Falta configurar GEMINI_API_KEY en Cloudflare" }, 500);

  try {
    const { receiptImage, receiptType, dashImage, dashType } = await context.request.json();
    if (!receiptImage && !dashImage) return json({ error: "No se recibió ninguna imagen" }, 400);

    const parts = [];
    if (receiptImage) parts.push({ inline_data: { mime_type: receiptType || "image/jpeg", data: receiptImage } });
    if (dashImage) parts.push({ inline_data: { mime_type: dashType || "image/jpeg", data: dashImage } });
    parts.push({
      text: `Estas imágenes son de un repostaje: la primera (si está) es el ticket de la gasolinera, la segunda (si está) es el cuadro/salpicadero del vehículo mostrando los kilómetros. Extrae los datos y responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin backticks, con esta forma exacta:
{"fecha": "YYYY-MM-DD o null", "litros": numero o null, "precioLitro": numero o null, "importeTotal": numero o null, "combustible": "uno de [${FUEL_TYPES.join(", ")}] o null", "kms": numero entero o null}
Si un dato no aparece con claridad en las imágenes, pon null en ese campo. No inventes datos.`,
    });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts }] }) }
    );
    const data = await res.json();
    if (!res.ok) return json({ error: data.error?.message || "Error al llamar a Gemini" }, res.status);

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch (e) { return json({ error: "La IA no devolvió un JSON válido" }, 502); }
    return json(parsed);
  } catch (e) {
    return json({ error: e.message || "Error inesperado" }, 500);
  }
}

export async function onRequestGet() {
  return json({ error: "Método no permitido" }, 405);
}
