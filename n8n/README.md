# LifeOS × n8n — workflow templates

Ready-made [n8n](https://n8n.io) workflows that connect LifeOS to other apps.
n8n is free/open-source: `docker run -it --rm -p 5678:5678 n8nio/n8n` (or [n8n Cloud](https://n8n.io)).

## Setup (once)

1. In LifeOS: **Definições → Integrações → 🔌 Automações** → **Gerar chave** and copy the key.
2. Set these environment variables on the machine/container running n8n:
   ```bash
   LIFEOS_TOKEN=<a chave que copiaste>
   TELEGRAM_CHAT_ID=<o teu chat id do Telegram>   # opcional, só para workflows com Telegram
   ```
3. In n8n: **Workflows → ⋯ → Import from File** and pick one of the JSON files below.
4. For Telegram workflows, connect your **Telegram bot** (via @BotFather) when n8n asks for credentials.

## Templates

### 📩 `telegram-to-task.json` — Telegram → nova tarefa
Any message you send to the bot becomes a **task** in LifeOS (tagged `telegram`).

### 📋 `lifeos-daily-digest.json` — digest diário
Every day at 08:00, reads your latest 10 LifeOS tasks (`GET /api/integrations/export`) and sends them to your Telegram.

## Going further

- **Webhook (create):** `POST https://lifeos-eosin-phi.vercel.app/api/integrations/webhook` with header
  `Authorization: Bearer <chave>` and body
  ```json
  { "action": "create_event", "payload": { "title": "Jantar", "start_at": "2026-08-21T20:00:00", "end_at": "2026-08-21T22:00:00" } }
  ```
  Actions: `create_task`, `create_event`, `create_note`, `create_transaction`.
- **Export (read):** `GET https://lifeos-eosin-phi.vercel.app/api/integrations/export?type=tasks`
  (`events`, `notes`, `transactions`) with the same header — feed the result into Notion, Google Sheets, e-mail, etc.
- Docs: [README.md](../README.md) (secção 🔌 7. Automações).
