/** Quick-capture parser: turn "€14.50 lunch", "20 coffee", "buy milk tomorrow" into structured intents. */

export interface Capture {
  kind: "expense" | "income" | "task" | "event" | "goal" | "trip" | "reminder" | "unknown";
  amount?: number;
  title: string;
  category?: string;
  due_date?: string | null;
  start_at?: string | null;
  target_amount?: number;
  destination?: string;
  note?: string;
}

const CATEGORY_HINTS: [RegExp, string][] = [
  [/\b(lunch|almoço|dinner|jantar|restaurant|restaurante|pizza|sushi|café|coffee|bar|uber|taxi|mercado|supermarket|grocer|mercearia|mercadorias)\b/i, "Food"],
  [/\b(rent|renda|aluguer)\b/i, "Rent"],
  [/\b(electricity|eletricidade|luz|water|água|internet|phone|telemóvel|insurance|seguro|gym|ginásio|spotify|netflix)\b/i, "Bills"],
  [/\b(transport|transportes|combustível|fuel|gasolina|metro|train|comboio)\b/i, "Transport"],
  [/\b(clothes|roupa|shoes|sapatos|amazon|zara|h&m)\b/i, "Shopping"],
  [/\b(games|jogos|steam|playstation|netflix)\b/i, "Entertainment"],
];

export function parseCapture(input: string): Capture {
  const text = input.trim();
  if (!text) return { kind: "unknown", title: "" };

  const money = text.match(/(?:€|eur|euros?|\$|usd)?\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:€|eur|euros?|\$|usd)?/i);
  const amount = money ? parseFloat(money[1].replace(",", ".")) : NaN;
  const hasAmount = Number.isFinite(amount) && amount > 0;
  const low = text.toLowerCase();

  // --- expense / income ---
  if (hasAmount) {
    const neg = /(gastei|spent|paguei|paid|comprei|bought|-|−)/.test(low);
    const pos = /(recebi|received|salary|salário|bónus|bonus|income|rendimento|ganhei|earned|\+)/.test(low);
    if (neg || (!pos && !/(cria|create|adiciona|add|guarda|save|lembra|remind)/.test(low))) {
      const title = (money ? text.replace(money[0], "") : text).trim().replace(/^(gastei|spent|paguei|paid|comprei|bought)\s+/i, "") || "Despesa";
      let category: string | undefined;
      for (const [re, cat] of CATEGORY_HINTS) {
        if (re.test(low)) {
          category = cat;
          break;
        }
      }
      return { kind: "expense", amount, title, category };
    }
    if (pos) {
      const title = (money ? text.replace(money[0], "") : text).trim().replace(/^(recebi|received|salário|salary|bónus|bonus|rendimento|income|ganhei|earned)\s+/i, "") || "Rendimento";
      return { kind: "income", amount, title };
    }
  }

  // --- goal ---
  const goal = text.match(/(?:quero|preciso|preciso de|need to|want to|vou)?\s*(?:poupar|guardar|save|poupança)\s*(?:para|for)?\s*(?:€|eur)?\s*(\d{1,6}(?:[.,]\d{1,2})?)/i);
  if (goal && money && hasAmount) {
    const name = (goal ? text.replace(goal[0], "") : text).trim().replace(/^(poupar|guardar|save)\s+/i, "") || "Objetivo de poupança";
    return { kind: "goal", title: name, target_amount: amount };
  }

  // --- trip ---
  const trip = text.match(/(?:viagem|trip|ir para|go to)\s+([a-zà-ü]{2,}(?:\s+[a-zà-ü]{2,})?)/i);
  if (/viagem|trip\b/.test(low) && trip) {
    return { kind: "trip", destination: trip[1].trim(), title: trip[1].trim() };
  }

  // --- event (day + time) ---
  const weekday = text.match(/\b(segunda|terça|quarta|quinta|sexta|sábado|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  const time = text.match(/\b(\d{1,2})[:h](\d{2})?\b/i);
  const tomorrow = /\b(amanhã|amanha|tomorrow)\b/i.test(low);
  if (weekday || tomorrow || (time && /(gym|ginásio|treino|jantar|dinner|dentist|médico|doctor|reunião|meeting|evento)/.test(low))) {
    const date = new Date();
    if (tomorrow) date.setDate(date.getDate() + 1);
    if (weekday) {
      const map: Record<string, number> = { segunda: 1, monday: 1, terça: 2, terca: 2, tuesday: 2, quarta: 3, wednesday: 3, quinta: 4, thursday: 4, sexta: 5, friday: 5, sábado: 6, sabado: 6, saturday: 6, domingo: 0, sunday: 0 };
      const target = map[weekday[1].toLowerCase()];
      const diff = (target - date.getDay() + 7) % 7;
      date.setDate(date.getDate() + (diff === 0 ? 7 : diff));
    }
    if (time) {
      const h = parseInt(time[1]);
      const m = time[2] ? parseInt(time[2]) : 0;
      date.setHours(h, m, 0, 0);
    } else {
      date.setHours(9, 0, 0, 0);
    }
    const title = text
      .replace(/\b(segunda|terça|quarta|quinta|sexta|sábado|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|amanhã|amanha|tomorrow|hoje|today|às|as|at|aos)\b/gi, "")
      .replace(time ? time[0] : "", "")
      .replace(/\s+/g, " ")
      .trim() || "Evento";
    return { kind: "event", title, start_at: date.toISOString() };
  }

  // --- reminder / task ---
  const reminder = text.match(/^(lembra[- ]?me|remind me|recorda[-]?me|avisa[-]?me)\s+(?:de|para|to|about|of)?\s*(.*)/i);
  if (reminder && reminder[2]) {
    return { kind: "reminder", title: reminder[2].trim() };
  }

  const task = text.match(/^(?:comprar|buy|fazer|do|terminar|finish|ligar|call|enviar|send|pagar|pay)\s+(.*)/i);
  if (task && task[1]) {
    let due: string | null = null;
    const tmr = /\b(amanhã|amanha|tomorrow)\b/i.test(low);
    const wk = text.match(/\b(segunda|terça|quarta|quinta|sexta|sábado|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    const d = new Date();
    if (tmr) d.setDate(d.getDate() + 1);
    if (wk) {
      const map: Record<string, number> = { segunda: 1, monday: 1, terça: 2, terca: 2, tuesday: 2, quarta: 3, wednesday: 3, quinta: 4, thursday: 4, sexta: 5, friday: 5, sábado: 6, sabado: 6, saturday: 6, domingo: 0, sunday: 0 };
      const diff = (map[wk[1].toLowerCase()] - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
    }
    if (tmr || wk) due = d.toISOString().slice(0, 10);
    return { kind: "task", title: task[1].trim(), due_date: due };
  }

  return { kind: "unknown", title: text };
}

/** Whether the input looks like a capturable quick entry (has amount or verb). */
export function looksCapturable(input: string): boolean {
  const c = parseCapture(input);
  return c.kind !== "unknown";
}
