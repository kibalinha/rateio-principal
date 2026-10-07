# 🏢 ShopRateio — Gestão Inteligente de Rateio para Shoppings

Plataforma completa e **Offline-First (PWA)** para gestão, leitura de medidores e rateio automatizado de **Luz ⚡**, **Água 💧** e **Gás 🔥** em shoppings centers e centros comerciais.

---

## 🚀 Principais Funcionalidades

- **📡 PWA & 100% Offline-First**: O técnico de campo pode coletar leituras e fotos nos subsolos sem sinal de internet. Ao reconectar, a sincronização com o Supabase é bidirecional e automática.
- **📷 Evidência Fotográfica Incontestável**: Compactação de imagens com marca d'água automática contendo data, hora e código LUC da loja.
- **🤖 Leitura Inteligente por IA (OCR)**: Extração automática do valor do relógio por IA (Groq Vision + Gemini Flash de fallback).
- **🔄 Gestão Dinâmica de Lojas**: Troca de contratos no mesmo ponto comercial (LUC) com preservação de histórico e inativação inteligente.
- **⚡ Sincronização em Tempo Real**: Alterações refletidas instantaneamente entre dispositivos móveis e computadores desktop via Supabase Realtime.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: Angular 21 (Signals, Standalone Components, Modern Architecture)
- **Styling**: Tailwind CSS
- **Banco de Dados & Storage**: Supabase (PostgreSQL + Supabase Storage)
- **Armazenamento Offline**: IndexedDB nativo + LocalStorage
- **IA**: Groq (Qwen Vision) & Google Gemini 2.5 Flash

---

## 💻 Executando Localmente

### Pré-requisitos
- Node.js 18+ instalado

```bash
# 1. Instalar dependências
npm install

# 2. Rodar em modo de desenvolvimento
npm run dev

# 3. Gerar build de produção
npm run build
```

O aplicativo estará disponível em: `http://localhost:3000`

---

## ☁️ Deploy na Vercel

O projeto já inclui o arquivo `vercel.json` configurado para Single Page Application (SPA).

1. Acesse [vercel.com](https://vercel.com) e conecte seu repositório: `https://github.com/kibalinha/rateio-principal.git`.
2. Em **Build and Output Settings**:
   - **Framework Preset**: `Other`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Em **Environment Variables**, adicione as seguintes variáveis:

| Variável | Descrição | Exemplo |
| :--- | :--- | :--- |
| `SUPABASE_URL` | URL do seu projeto no Supabase | `https://xxxx.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Chave pública anônima do Supabase | `sb_publishable_...` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase (compatibilidade) | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave anônima (compatibilidade) | `sb_publishable_...` |
| `GROQ_API_KEY` | Chave de API da Groq para OCR ultrarrápido | Obter em console.groq.com |
| `GEMINI_API_KEY` | Chave do Google Gemini (OCR fallback) | Obter em aistudio.google.com |

4. Clique em **Deploy**.

---

## 🗄️ Configuração do Supabase (Se criar um projeto novo)

Caso utilize um novo projeto no Supabase, configure:

### 1. Script SQL das Tabelas
No painel do Supabase, abra o **SQL Editor** e execute:

```sql
-- 1. Tabela de Lojas
CREATE TABLE IF NOT EXISTS public.stores (
  id TEXT PRIMARY KEY,
  luc TEXT NOT NULL,
  contrato TEXT,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  deactivated_at TEXT,
  deactivation_reason TEXT,
  uses_luz BOOLEAN DEFAULT TRUE,
  uses_agua BOOLEAN DEFAULT TRUE,
  uses_gas BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Fechamentos Mensais
CREATE TABLE IF NOT EXISTS public.bills (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  month TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Evidências Fotográficas
CREATE TABLE IF NOT EXISTS public.meter_photos (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  month TEXT NOT NULL,
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  luc TEXT NOT NULL,
  reading_value NUMERIC DEFAULT 0,
  photo_data_url TEXT NOT NULL,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  note TEXT
);

-- 4. Fila Offline
CREATE TABLE IF NOT EXISTS public.sync_queue (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type TEXT NOT NULL,
  month TEXT NOT NULL,
  data JSONB NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE
);

-- 5. Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bills;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meter_photos;
```

### 2. Storage Bucket
1. No menu lateral do Supabase, vá em **Storage**.
2. Clique em **New Bucket**.
3. Nomeie o bucket como: `meter-photos`.
4. Marque a opção **Public Bucket** como `ON` (Permite a visualização das fotos dos comprovantes pelos técnicos e gestores).
5. Salve o bucket.
