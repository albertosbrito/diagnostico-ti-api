const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false }
  });
}

async function initDatabase() {
  if (!pool) return;

  await pool.query(`
    create table if not exists public.leads_diagnostico_ti (
      id bigserial primary key,
      email text not null,
      score integer,
      total integer,
      pct integer,
      erros jsonb,
      origem text,
      user_agent text,
      ip text,
      created_at timestamptz not null default now()
    );
  `);

  await pool.query(`
    create index if not exists idx_leads_diagnostico_ti_email
    on public.leads_diagnostico_ti (lower(email));
  `);
}

function isEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeErrors(erros) {
  if (!Array.isArray(erros)) return [];
  return erros
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function getLevel(pct) {
  if (pct < 50) return "Iniciante";
  if (pct < 80) return "Intermediário";
  return "Profissional";
}

function buildRecommendations(erros) {
  const joined = erros.join(" ").toLowerCase();

  if (joined.includes("procv") || joined.includes("soma") || joined.includes("tabela dinâmica") || joined.includes("excel")) {
    return {
      produto: "Excel com IA",
      url: "https://pay.kiwify.com.br/8ST9DMO"
    };
  }

  if (joined.includes("word") || joined.includes("sumário") || joined.includes("negrito")) {
    return {
      produto: "Word Básico",
      url: "https://pay.kiwify.com.br/CKv3YRe"
    };
  }

  if (joined.includes("internet") || joined.includes("https") || joined.includes("phishing") || joined.includes("url")) {
    return {
      produto: "Internet 2.0",
      url: "https://kiwify.app/JGQZc4q"
    };
  }

  if (joined.includes("erp") || joined.includes("sap")) {
    return {
      produto: "ERP",
      url: "https://pay.kiwify.com.br/Lpj5RPj"
    };
  }

  if (joined.includes("windows") || joined.includes("explorador") || joined.includes("arquivo")) {
    return {
      produto: "Informática para Concurso",
      url: "https://pay.kiwify.com.br/TfqsJLX"
    };
  }

  return {
    produto: "Pack do Office",
    url: "https://pay.kiwify.com.br/jnOuze5"
  };
}

async function sendLeadEmail({ email, score, total, pct, erros }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { sent: false, reason: "SMTP não configurado" };
  }

  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const level = getLevel(Number(pct || 0));
  const recommendation = buildRecommendations(erros);

  const errosHtml = erros.length
    ? `<ul>${erros.map((erro) => `<li>${erro}</li>`).join("")}</ul>`
    : "<p>Nenhum ponto crítico foi identificado.</p>";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1B1F24;">
      <h2>Seu diagnóstico de informática está pronto</h2>

      <p>Você acertou <strong>${score} de ${total}</strong> questões.</p>
      <p>Seu aproveitamento foi de <strong>${pct}%</strong>.</p>
      <p>Seu nível estimado é: <strong>${level}</strong>.</p>

      <h3>Pontos para revisar</h3>
      ${errosHtml}

      <h3>Material recomendado</h3>
      <p>Com base no seu resultado, recomendo começar por:</p>
      <p><strong>${recommendation.produto}</strong></p>
      <p>
        <a href="${recommendation.url}" target="_blank" rel="noopener"
           style="display:inline-block;background:#2A6BE4;color:#fff;padding:12px 18px;text-decoration:none;border-radius:4px;">
          Acessar material recomendado
        </a>
      </p>

      <p>Abraço,<br>Alberto Brito</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.MAIL_FROM || `"Alberto Brito" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Seu diagnóstico de informática está pronto",
    html
  });

  if (process.env.OWNER_EMAIL) {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || `"Diagnóstico TI" <${process.env.SMTP_USER}>`,
      to: process.env.OWNER_EMAIL,
      subject: `Novo lead no diagnóstico: ${email}`,
      html: `
        <h2>Novo lead capturado</h2>
        <p><strong>E-mail:</strong> ${email}</p>
        <p><strong>Resultado:</strong> ${score}/${total} (${pct}%)</p>
        <p><strong>Erros:</strong> ${erros.join(", ") || "Nenhum informado"}</p>
      `
    });
  }

  return { sent: true };
}

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "diagnostico-ti-api"
  });
});

app.get("/health", async (req, res) => {
  try {
    if (pool) await pool.query("select 1");
    res.json({
      ok: true,
      database: Boolean(pool),
      smtp: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/lead", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const score = Number(req.body.score || 0);
    const total = Number(req.body.total || 0);
    const pct = Number(req.body.pct || 0);
    const erros = normalizeErrors(req.body.erros);
    const origem = req.body.origem ? String(req.body.origem).slice(0, 500) : null;
    const userAgent = req.body.userAgent ? String(req.body.userAgent).slice(0, 500) : req.get("user-agent");
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || null;

    if (!isEmail(email)) {
      return res.status(400).json({ ok: false, error: "E-mail inválido" });
    }

    if (pool) {
      await pool.query(
        `insert into public.leads_diagnostico_ti
         (email, score, total, pct, erros, origem, user_agent, ip)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
        [email, score, total, pct, JSON.stringify(erros), origem, userAgent, ip]
      );
    }

    const emailStatus = await sendLeadEmail({ email, score, total, pct, erros });

    res.json({
      ok: true,
      saved: Boolean(pool),
      email: emailStatus
    });
  } catch (error) {
    console.error("Erro no /lead:", error);
    res.status(500).json({ ok: false, error: "Erro ao processar lead" });
  }
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`diagnostico-ti-api rodando na porta ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Erro ao iniciar banco:", error);
    process.exit(1);
  });
