/* ------------------------------------------------------------------ */
/* "Don't forget" (#23): useful prep hints for calendar events.        */
/* Rule-based on event title/location. Never invent requirements.      */
/* ------------------------------------------------------------------ */

export function dontForgetHints(title: string, location: string | null): string[] {
  const text = `${title} ${location ?? ""}`.toLowerCase();
  const hints: string[] = [];

  if (/(dentista|dentist|dental|ortodontista)/.test(text)) hints.push("🪥 Seguro de saúde e informação da consulta");
  if (/(voo|flight|aeroporto|airport|check[- ]?in)/.test(text)) hints.push("🛂 Passaporte/cartão de cidadão e cartão de embarque");
  if (/(m[ée]dic|consulta m|doctor|appointment|hospital|enfermeir)/.test(text)) hints.push("🩺 Cartão de saúde e lista de medicação");
  if (/(entrevista|interview)/.test(text)) hints.push("📄 CV atualizado e perguntas para fazer");
  if (/(cliente|client|reuni[ãa]o|meeting|apresenta)/.test(text)) hints.push("💻 Portátil carregado e material da reunião");
  if (/(gin[áa]sio|gym|treino|workout|correr|run)/.test(text)) hints.push("🏋️ Roupa de treino, toalha e água");
  if (/(exame|exam|prova|teste)/.test(text)) hints.push("✏️ Material de escrita e cartão de estudante");
  if (/(anivers[áa]rio|birthday|festa|party)/.test(text)) hints.push("🎁 Presente/cartão e câmara para fotos");
  if (/(jantar|dinner|restaurante|restaurant|almo[çc]o|lunch)/.test(text)) hints.push("🍷 Reserva confirmada e transporte");
  if (/(passaporte|passport|embaixada|consulado|consulate)/.test(text)) hints.push("🛂 Documentos originais e fotocópias");

  return hints.slice(0, 3);
}

/* ------------------------------------------------------------------ */
/* Smart packing (#22): base packing list, duration-aware.             */
/* ------------------------------------------------------------------ */

export function packingList(days: number): string[] {
  const out = [
    "👕 Roupa para os dias",
    "🩲 Roupa interior e meias",
    "🔌 Carregador e power bank",
    "🧴 Artigos de higiene",
    "💊 Medicação (se tomares)",
  ];
  if (days >= 2) out.splice(1, 0, "🪥 Escova de dentes e pasta");
  if (days >= 3) out.splice(1, 0, "👟 Um par extra de sapatos");
  if (days >= 4) out.push("📄 Documentos de viagem (passaporte/cartão)");
  if (days >= 7) out.push("🧺 Saco para roupa suja");
  if (days >= 10) out.push("🧥 Casaco/agasalho extra");
  return out;
}
