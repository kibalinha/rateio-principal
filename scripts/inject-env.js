import fs from 'fs';

// Silencia aviso de console do Tailwind
const tailwindPath = 'public/tailwind.min.js';
if (fs.existsSync(tailwindPath)) {
  let tw = fs.readFileSync(tailwindPath, 'utf8');
  tw = tw.replace(/console\.warn\([^)]*should not be used in production[^)]*\)/g, 'void 0');
  fs.writeFileSync(tailwindPath, tw, 'utf8');
}

// Injeta variáveis de ambiente da Vercel no index.html antes do build
const indexPath = 'index.html';
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');

  const groqKey = process.env.GROQ_API_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

  if (supabaseKey && supabaseKey.toLowerCase().includes('service_role')) {
    console.error('ERRO FATAL DE SEGURANÇA: Tentativa de injetar chave "service_role" no frontend! Abortando build.');
    process.exit(1);
  }

  if (groqKey) {
    html = html.replace(
      /window\.process\.env\.GROQ_API_KEY\s*=\s*window\.process\.env\.GROQ_API_KEY\s*\|\|\s*'[^']*';/,
      `window.process.env.GROQ_API_KEY = window.process.env.GROQ_API_KEY || '${groqKey}';`
    );
  }

  if (geminiKey) {
    html = html.replace(
      /window\.process\.env\.GEMINI_API_KEY\s*=\s*window\.process\.env\.GEMINI_API_KEY\s*\|\|\s*'[^']*';/,
      `window.process.env.GEMINI_API_KEY = window.process.env.GEMINI_API_KEY || '${geminiKey}';`
    );
  }

  if (supabaseUrl) {
    html = html.replace(
      /window\.process\.env\.SUPABASE_URL\s*=\s*window\.process\.env\.SUPABASE_URL\s*\|\|\s*'[^']*';/,
      `window.process.env.SUPABASE_URL = window.process.env.SUPABASE_URL || '${supabaseUrl}';`
    );
  }

  if (supabaseKey) {
    html = html.replace(
      /window\.process\.env\.SUPABASE_PUBLISHABLE_KEY\s*=\s*window\.process\.env\.SUPABASE_PUBLISHABLE_KEY\s*\|\|\s*'[^']*';/,
      `window.process.env.SUPABASE_PUBLISHABLE_KEY = window.process.env.SUPABASE_PUBLISHABLE_KEY || '${supabaseKey}';`
    );
  }

  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('✓ Injeção de variáveis de ambiente no index.html concluída.');
}
