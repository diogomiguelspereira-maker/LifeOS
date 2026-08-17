# LifeOS 🧠

O teu centro de comando pessoal — dinheiro, tarefas, hábitos, objetivos e calendário num só lugar, com a **Nova**, a tua assistente pessoal com IA.

Built with **Next.js 16 · TypeScript · Tailwind CSS · Supabase** (Postgres + Auth + RLS).

---

## ✨ Funcionalidades

- **Dashboard personalizável** — widgets reordenáveis (dinheiro, briefing da Nova, tarefas de hoje, eventos, hábitos, objetivos, contas a pagar, gráfico de gastos)
- **Dinheiro** — contas, movimentos, categorias automáticas, subscrições, saldo/património, "para onde foi o meu dinheiro?"
- **Orçamentos inteligentes** — plano 50/30/20 com limites por categoria e análise da Nova
- **Objetivos de poupança** — progresso, data estimada de conclusão e sugestão de contribuição mensal
- **Tarefas** — quick-add com linguagem natural ("comprar mercearias amanhã às 18:00"), prioridades, projetos, etiquetas
- **Hábitos** — streaks, consistência e alvos semanais
- **Calendário** — vistas dia/semana/mês (Google Calendar pronto a ligar via OAuth)
- **Notas + Diário** — segundo cérebro com favoritos, etiquetas e humor
- **Pessoas** — aniversários e "não falas com X há N dias"
- **Estatísticas** — rendimento vs despesas, taxas de conclusão
- **Nova (IA)** — chatbot com contexto real dos teus dados e **ações confirmadas pelo utilizador** (criar tarefas, eventos, objetivos, notas, movimentos)
- **Command Palette** — `Ctrl/Cmd + K`
- **Privacidade** — autenticação, Row Level Security (cada utilizador só vê os seus dados), exportação de dados, PT/EN, tema escuro/claro, EUR por defeito

---

## 🗄️ 1. Base de dados (Supabase)

> **Requisito obrigatório antes de publicar.** A app funciona sem isto, mas nada é guardado.

1. Cria um projeto em [supabase.com](https://supabase.com) (ou usa o existente).
2. Abre **Dashboard → SQL Editor → New query**, cola o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e executa.
   - Cria todas as tabelas (perfis, contas, movimentos, orçamentos, objetivos, tarefas, hábitos, notas, calendário, etc.)
   - Ativa **RLS** em todas as tabelas (cada utilizador vê apenas os seus dados)
   - Cria o trigger que, ao registar, gera perfil + contas + categorias por defeito
3. **Authentication → Providers → Email**: confirma que o e-mail está ativo.
   - *(Opcional)* **Google**: ativa o provider e adiciona o Client ID/Secret de um [projeto Google Cloud](https://console.cloud.google.com) (redirect URL: `https://<o-teu-dominio>/auth/callback`).

## 🔑 2. Variáveis de ambiente

Copia `.env.example` para `.env.local` e preenche (já tens `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` se o `.env` anterior existir):

```env
NEXT_PUBLIC_SUPABASE_URL=https://XXXX.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
OPENAI_API_KEY=sk-...        # opcional — sem esta, a Nova funciona em "modo offline" com respostas locais
```

A chave `anon` é pública (a segurança vem do RLS). A `OPENAI_API_KEY` **nunca** vai para o browser.

## 🚀 3. Correr localmente

```bash
npm install
npm run dev      # http://localhost:3000
```

## ▲ 4. Publicar na Vercel

1. `npm i -g vercel` (ou `npx vercel`)
2. `vercel login`
3. `vercel` — liga o projeto; **Project Settings → Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY` *(opcional)*
4. `vercel --prod`

Ou liga o repositório GitHub na Vercel — cada push publica automaticamente.

## 🔗 5. Google Calendar (opcional, em preparação)

A UI já mostra o estado da integração. Para ativar:
1. Google Cloud Console → cria um **OAuth 2.0 Client ID** (Web) com redirect `https://<dominio>/auth/callback/google`.
2. Adiciona as variáveis `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` na Vercel.

## 🔒 Segurança

- Todas as tabelas têm **Row Level Security** — é impossível ler dados de outro utilizador pela API.
- A chave da OpenAI vive apenas no servidor (route `/api/nova`).
- Credenciais nunca são guardadas no browser; sessões geridas com cookies seguros (`@supabase/ssr`).
- Exportação de dados em Definições (GDPR-friendly) e eliminação de conta.

---

Feito com 💜 — LifeOS.
