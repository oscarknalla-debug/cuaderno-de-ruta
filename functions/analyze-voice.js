const FUEL_TYPES = ["Gasolina 95", "Gasolina 98", "Diésel", "Diésel+", "GLP", "Eléctrico"];

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export async function onRequestPost(context) {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "Falta configurar GEMINI_API_KEY en Cloudflare" }, 500);

  try {
    const { transcript, recordType } = await context.request.json();
    if (!transcript || !transcript.trim()) return json({ error: "No se recibió ningún texto dictado" }, 400);

    const today = new Date().toISOString().slice(0, 10);
    let promptText;
    if (recordType === "repostaje") {
      promptText = `Este texto es un dictado por voz de un repostaje de vehículo, transcrito automáticamente por el navegador (puede tener errores de transcripción, corrígelos si son obvios): "${transcript}"
Hoy es ${today}. Extrae los datos y responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin backticks, con esta forma exacta:
{"fecha": "YYYY-MM-DD (si no se menciona, usa la de hoy)", "kms": numero entero o null, "combustible": "uno exacto de [${FUEL_TYPES.join(", ")}] o null", "litros": numero o null, "precioLitro": numero o null, "importeTotal": numero o null}
Si un dato no se menciona con claridad, pon null en ese campo. No inventes datos. Si solo se menciona el importe total (no el precio por litro), deja precioLitro en null.`;
    } else {
      promptText = `Este texto es un dictado por voz de una reparación o mantenimiento de un vehículo, transcrito automáticamente por el navegador (puede tener errores de transcripción, corrígelos si son obvios): "${transcript}"
Hoy es ${today}. Extrae los datos y responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin backticks, con esta forma exacta:
{"fecha": "YYYY-MM-DD (si no se menciona, usa la de hoy)", "kms": numero entero o null, "descripcion": "resumen breve en español de lo que se hizo (materiales, mano de obra, etc.) o null", "coste": numero o null, "avisoKms": numero entero o null (solo si se pide expresamente un aviso o recordatorio para unos kilómetros futuros concretos)}
Si un dato no se menciona con claridad, pon null en ese campo. No inventes datos.`;
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] }) }
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
