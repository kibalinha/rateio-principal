# Diretrizes do Projeto - Shopping Rateio Principal

Sistema de gestão e rateio de despesas (água, energia, áreas comuns) para shopping centers e condomínios comerciais.

## Stack Tecnológica
- **Frontend**: Angular 21 (v21.1.0) com Standalone Components, Signals, RxJS e Tailwind CSS v4 (`@tailwindcss/postcss`).
- **Testes**:
  - Testes Unitários: `npm test` (`vitest run` com Vitest 5)
  - Testes E2E: `npm run test:e2e` (`playwright test` com Playwright)
- **Autenticação & Cloud**: `@azure/msal-browser` (Microsoft Entra ID) e backend `azure/functions`.
- **Banco de Dados & Storage**: `@supabase/supabase-js` (PostgreSQL e fotos de medidores).
- **IA / OCR**: `@google/genai` (Google Gemini) para transcrição e validação de hidrômetros e medidores.

## Comandos Principais
- `npm run dev`: Inicia o servidor local de desenvolvimento (`ng serve`).
- `npm test`: Executa os testes unitários do motor de rateio com Vitest.
- `npm run build`: Injeta variáveis de ambiente e compila o bundle de produção.
- `npm run test:e2e`: Executa testes end-to-end com Playwright.

## Invariantes & Regras de Negócio Críticas
1. **Precisão Matemática**: Qualquer alteração em `apportionment-engine.service.ts` ou `store.service.ts` deve respeitar soma exata com a fatura da concessionária (tolerância de centavos atribuída à administração).
2. **Virada de Medidores**: Todo cálculo de consumo deve tratar casos onde a leitura atual é menor que a anterior devido a estouro de dígitos mecânicos (rollover).
3. **Segurança de Variáveis**: Arquivos `.env*` nunca devem ter segredos commitados nem sofrer edições automatizadas sem confirmação do operador.
4. **Subagentes Disponíveis**:
   - `apportionment-auditor`: Para auditoria de regras de rateio e balanço de despesas.
   - `azure-migration-reviewer`: Para auditoria de conformidade MSAL e arquitetura Azure.
