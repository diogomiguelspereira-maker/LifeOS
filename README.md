# LifeOS 🧠

O teu centro de comando pessoal — dinheiro, tarefas, hábitos, objetivos e calendário num só lugar, com a **Nova**, a tua assistente pessoal com IA.

Built with **Next.js 16 · TypeScript · Tailwind CSS · Supabase** (Postgres + Auth + RLS).

---

## ✨ Funcionalidades

- **Dashboard personalizável** — widgets reordenáveis (dinheiro, briefing da Nova, "o que fazer a seguir?", tarefas, eventos, hábitos, objetivos, contas a pagar, gráfico) + **modos** (Trabalho / Finanças / Estudo / Fim de semana / Viagem)
- **Dinheiro** — contas, movimentos, categorias automáticas, subscrições, saldo/património, "para onde foi o meu dinheiro?"
- **Finance Hub** — payday countdown, safe-to-spend, limites diário/semanal, previsão de saldo (7/30/60/90d), timeline de património, comparativo mensal, mercados, heatmap de gastos, simulador de bónus, fundo de emergência, desafios financeiros
- **Orçamentos inteligentes** — plano 50/30/20 com limites por categoria e análise da Nova
- **Objetivos de poupança** — progresso, data estimada de conclusão e sugestão de contribuição mensal
- **Tarefas** — quick-add com linguagem natural, prioridades, projetos, etiquetas, foco
- **Focus/Pomodoro** — timer com sessões ligadas a tarefas
- **Hábitos** — streaks, consistência e alvos semanais
- **Calendário** — vistas dia/semana/mês, **deteção de conflitos** e **tempo livre** (Google Calendar pronto a ligar via OAuth)
- **Bem-estar** — sono, água, exercício, humor e energia (informativo, sem diagnósticos)
- **Aprendizagem** — livros, cursos, sessões de estudo e horas estudadas
- **Carreira** — roadmap, matriz de competências, candidaturas a emprego e salários
- **Viagens** — orçamento, itinerário, packing e gastos por viagem
- **Social** — despesas partilhadas com split bills ("quem deve a quem")
- **Digital & Docs** — dispositivos, garantias, licenças, domínios e documentos com alertas de expiração (passaporte, carta…)
- **Notas + Diário** — segundo cérebro com favoritos, etiquetas e humor
- **Pessoas** — aniversários e "não falas com X há N dias"
- **Estatísticas** — rendimento vs despesas, taxas de conclusão
- **Nova (IA)** — chatbot com contexto real (finanças, tarefas, calendário, hábitos, carreira, aprendizagem, viagens), **memória controlável**, **5 personalidades**, **revisão semanal** e **planos com aprovação + Undo** (criar vários eventos/tarefas de uma vez, revertíveis)
- **Sistema NOW** — banner "Agora" (🟢 livre / 🔴 ocupado / 🚗 sair em X), **"O que devo fazer?"** com sugestões realistas pelo tempo livre, gaps de tempo livre
- **Captura rápida** — `Ctrl/Cmd + K` ou botão flutuante (📱): escreve "€14,50 almoço", "20 café", "comprar leite amanhã" → guarda em 1 toque (despesa com categoria, tarefa, evento, objetivo, viagem)
- **Command Palette + pesquisa global** — `Ctrl/Cmd + K` pesquisa tarefas, notas, eventos, movimentos, metas, pessoas, viagens, documentos e subscrições
- **Timeline de dinheiro** — próximos 30 dias de cash flow (salário, contas, poupança automática)
- **Can I afford this?** — análise em cada item da wishlist (sim/não + porquê + criar objetivo)
- **Life Admin** — tarefas atrasadas, contas a vencer, documentos a expirar, subscrições a cancelar e aniversários num só sítio
- **Privacidade** — autenticação, Row Level Security, exportação de dados, PT/EN/ES/FR, tema escuro/claro, EUR/USD/GBP/CHF/CAD/BRL/JPY

---

## 🗄️ 1. Base de dados (Supabase)

> **Requisito obrigatório antes de publicar.** A app funciona sem isto, mas nada é guardado.

1. Cria um projeto em [supabase.com](https://supabase.com) (ou usa o existente).
2. Abre **Dashboard → SQL Editor → New query**, cola o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e executa.
   - **Pode ser re-executado sem problema**: remove as tabelas LifeOS antigas e recria tudo de raiz (todas as tabelas estão vazias até haver registos).
   - Cria todas as tabelas (perfis, contas, movimentos, orçamentos, objetivos, tarefas, hábitos, notas, calendário, etc.)
   - Ativa **RLS** em todas as tabelas (cada utilizador vê apenas os seus dados)
   - Cria o trigger que, ao registar, gera perfil + contas + categorias por defeito
3. **Expansão (Finance Hub, Foco, Bem-estar, Carreira, Viagens, Memória da Nova…):** abre **SQL Editor → New query**, cola o conteúdo de [`supabase/migration-2.sql`](supabase/migration-2.sql) e executa.
   - **Aditivo e seguro**: apenas adiciona tabelas novas (+1 coluna em `subscriptions`) — não apaga nem altera dados existentes. Pode ser corrido em qualquer altura, mesmo depois de já usares a app.
4. **Google Calendar + Undo (Life Admin, NOW, captura rápida):** abre **SQL Editor → New query**, cola o conteúdo de [`supabase/migration-3.sql`](supabase/migration-3.sql) e executa.
   - Adiciona `google_tokens` (tokens encriptados com RLS) e `ai_action_log` (histórico de ações da IA para reverter).
5. **Inteligência de prazos (subtarefas, breakdown automático):** abre **SQL Editor → New query**, cola o conteúdo de [`supabase/migration-4.sql`](supabase/migration-4.sql) e executa.
   - Adiciona a coluna `parent_task_id` à tabela `tasks` (permite dividir tarefas em subtarefas).
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

> **IA grátis?** A Nova aceita **qualquer API compatível com OpenAI** — não precisa de ser a OpenAI paga.
> Com uma chave grátis de [SambaNova](https://cloud.sambanova.ai/), [Groq](https://console.groq.com/) ou [Gemini (AI Studio)](https://aistudio.google.com/), define também `OPENAI_BASE_URL` e `OPENAI_MODEL` (ver `.env.example`).

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

## 🔗 5. Google Calendar (opcional)

Integração **completa** (OAuth 2.0 com encriptação dos tokens): ligar, sincronizar, desligar, badge nos eventos e push de novos eventos. Para ativar:

1. **Google Cloud Console** → cria um **OAuth 2.0 Client ID** (Web):
   - **Authorized redirect URIs**: `https://<dominio>/api/google/callback` (ex: `https://lifeos-eosin-phi.vercel.app/api/google/callback`)
   - Ativa a API **Google Calendar** (APIs & Services → Library → Google Calendar API → Enable)
2. Adiciona na Vercel (**Project → Settings → Environment Variables**):
   ```env
   GOOGLE_CLIENT_ID=XXXX.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   GOOGLE_TOKEN_KEY=qualquer-string-secreta-longa   # encripta os tokens na BD
   NEXT_PUBLIC_APP_URL=https://<dominio>            # já definido nesta app
   ```
3. Na app: **Definições → Integrações → Ligar Google Calendar** → autoriza → os eventos aparecem no calendário (sincronização automática ao abrir + botão manual).

> Os tokens nunca vão para o browser: são encriptados (AES-256-GCM) e guardados na tabela `google_tokens` com RLS (só o dono).

## 🔒 Segurança

- Todas as tabelas têm **Row Level Security** — é impossível ler dados de outro utilizador pela API.
- A chave da OpenAI vive apenas no servidor (route `/api/nova`).
- Credenciais nunca são guardadas no browser; sessões geridas com cookies seguros (`@supabase/ssr`).
- Exportação de dados em Definições (GDPR-friendly) e eliminação de conta.

---

Feito com 💜 — LifeOS.
