# Diagnóstico TI API

API Node.js para receber leads da página do diagnóstico, salvar em PostgreSQL e enviar o resultado por e-mail.

## Endpoints

### `GET /health`

Verifica se a API está online, se o banco está conectado e se o SMTP está configurado.

### `POST /lead`

Payload esperado:

```json
{
  "email": "seguidor@email.com",
  "score": 30,
  "total": 39,
  "pct": 77,
  "erros": ["PROCV", "Tabela Dinâmica"],
  "origem": "https://diagnostico-ti.pages.dev",
  "userAgent": "..."
}
```

## Variáveis de ambiente no Railway

```env
CORS_ORIGIN=*
DATABASE_URL=...
PGSSL=true

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seuemail@gmail.com
SMTP_PASS=sua_senha_de_app
MAIL_FROM="Alberto Brito <seuemail@gmail.com>"
OWNER_EMAIL=seuemail@gmail.com
```

## Observação

Para Gmail, use uma **senha de app**, não a senha normal da conta.
