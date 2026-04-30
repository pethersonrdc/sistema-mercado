const express = require("express");
const cors = require("cors");
const sql = require("mssql");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
const JWT_SECRET = "mercado_jwt_secret_local_2026";

const dbConfig = {
  user: "appuser",
  password: "App@123456",
  server: "127.0.0.1",
  port: 1433,
database: "app_db",
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

let pool;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(dbConfig);
  }
  return pool;
}

async function initDb() {
  const conn = await getPool();
  await conn.request().query(`
    IF OBJECT_ID('dbo.produtos', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.produtos (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome NVARCHAR(120) NOT NULL,
        preco DECIMAL(10,2) NOT NULL CHECK (preco >= 0),
        estoque INT NOT NULL CHECK (estoque >= 0),
        criado_em DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
    END;

    IF OBJECT_ID('dbo.vendas', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.vendas (
        id INT IDENTITY(1,1) PRIMARY KEY,
        produto_id INT NOT NULL,
        quantidade INT NOT NULL CHECK (quantidade > 0),
        total DECIMAL(10,2) NOT NULL CHECK (total >= 0),
        vendido_em DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT FK_vendas_produtos FOREIGN KEY (produto_id) REFERENCES dbo.produtos(id)
      );
    END;

    IF OBJECT_ID('dbo.usuarios', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.usuarios (
        id INT IDENTITY(1,1) PRIMARY KEY,
        usuario NVARCHAR(60) NOT NULL UNIQUE,
        senha_hash NVARCHAR(255) NOT NULL,
        criado_em DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
    END;
  `);

  const adminUser = "PETHERSON";
  const adminHash = await bcrypt.hash("274165", 10);
  await conn
    .request()
    .input("usuario", sql.NVarChar(60), adminUser)
    .input("senha_hash", sql.NVarChar(255), adminHash)
    .query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.usuarios WHERE usuario = @usuario)
      BEGIN
        INSERT INTO dbo.usuarios (usuario, senha_hash) VALUES (@usuario, @senha_hash);
      END;
    `);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const queryToken = typeof req.query.token === "string" ? req.query.token : "";
  const token = headerToken || queryToken;
  if (!token) {
    return res.status(401).json({ error: "Token ausente." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (_err) {
    return res.status(401).json({ error: "Token invalido ou expirado." });
  }
}

app.post("/api/login", async (req, res) => {
  const { usuario, senha } = req.body;
  if (!usuario || !senha) {
    return res.status(400).json({ error: "Informe usuario e senha." });
  }

  try {
    const conn = await getPool();
    const result = await conn
      .request()
      .input("usuario", sql.NVarChar(60), usuario)
      .query("SELECT TOP 1 id, usuario, senha_hash FROM dbo.usuarios WHERE usuario = @usuario");

    if (!result.recordset.length) {
      return res.status(401).json({ error: "Credenciais invalidas." });
    }

    const user = result.recordset[0];
    const ok = await bcrypt.compare(senha, user.senha_hash);
    if (!ok) {
      return res.status(401).json({ error: "Credenciais invalidas." });
    }

    const token = jwt.sign({ id: user.id, usuario: user.usuario }, JWT_SECRET, {
      expiresIn: "8h",
    });

    res.json({ token, usuario: user.usuario });
  } catch (err) {
    res.status(500).json({ error: "Erro no login.", detail: err.message });
  }
});

app.use("/api", authMiddleware);

app.get("/api/produtos", async (_req, res) => {
  try {
    const conn = await getPool();
    const result = await conn
      .request()
      .query("SELECT id, nome, preco, estoque FROM dbo.produtos ORDER BY id DESC");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar produtos.", detail: err.message });
  }
});

app.post("/api/produtos", async (req, res) => {
  const { nome, preco, estoque } = req.body;
  if (!nome || preco == null || estoque == null) {
    return res.status(400).json({ error: "Informe nome, preco e estoque." });
  }

  try {
    const conn = await getPool();
    await conn
      .request()
      .input("nome", sql.NVarChar(120), nome)
      .input("preco", sql.Decimal(10, 2), Number(preco))
      .input("estoque", sql.Int, Number(estoque))
      .query(
        "INSERT INTO dbo.produtos (nome, preco, estoque) VALUES (@nome, @preco, @estoque)"
      );
    res.status(201).json({ message: "Produto cadastrado com sucesso." });
  } catch (err) {
    res.status(500).json({ error: "Erro ao cadastrar produto.", detail: err.message });
  }
});

app.post("/api/vendas", async (req, res) => {
  const { produto_id, quantidade } = req.body;
  if (!produto_id || !quantidade || Number(quantidade) <= 0) {
    return res.status(400).json({ error: "Informe produto_id e quantidade valida." });
  }

  const qty = Number(quantidade);
  const conn = await getPool();
  const tx = new sql.Transaction(conn);

  try {
    await tx.begin();
    const request = new sql.Request(tx);

    const produto = await request
      .input("id", sql.Int, Number(produto_id))
      .query("SELECT id, nome, preco, estoque FROM dbo.produtos WHERE id = @id");

    if (produto.recordset.length === 0) {
      await tx.rollback();
      return res.status(404).json({ error: "Produto nao encontrado." });
    }

    const item = produto.recordset[0];
    if (item.estoque < qty) {
      await tx.rollback();
      return res.status(400).json({ error: "Estoque insuficiente." });
    }

    const total = Number(item.preco) * qty;

    await new sql.Request(tx)
      .input("novoEstoque", sql.Int, item.estoque - qty)
      .input("id", sql.Int, item.id)
      .query("UPDATE dbo.produtos SET estoque = @novoEstoque WHERE id = @id");

    await new sql.Request(tx)
      .input("produtoId", sql.Int, item.id)
      .input("quantidade", sql.Int, qty)
      .input("total", sql.Decimal(10, 2), total)
      .query(
        "INSERT INTO dbo.vendas (produto_id, quantidade, total) VALUES (@produtoId, @quantidade, @total)"
      );

    await tx.commit();
    res.status(201).json({ message: "Venda registrada com sucesso." });
  } catch (err) {
    if (tx._aborted !== true) {
      await tx.rollback();
    }
    res.status(500).json({ error: "Erro ao registrar venda.", detail: err.message });
  }
});

app.get("/api/vendas", async (_req, res) => {
  try {
    const conn = await getPool();
    const result = await conn.request().query(`
      SELECT
        v.id,
        p.nome AS produto,
        v.quantidade,
        v.total,
        v.vendido_em
      FROM dbo.vendas v
      INNER JOIN dbo.produtos p ON p.id = v.produto_id
      ORDER BY v.id DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar vendas.", detail: err.message });
  }
});

app.get("/api/relatorio/caixa-dia", async (req, res) => {
  const data = req.query.data;
  if (!data) {
    return res.status(400).json({ error: "Informe a data no formato AAAA-MM-DD." });
  }

  try {
    const conn = await getPool();
    const result = await conn
      .request()
      .input("data", sql.Date, data)
      .query(`
        SELECT
          CAST(@data AS DATE) AS data,
          COUNT(*) AS total_vendas,
          ISNULL(SUM(total), 0) AS valor_total
        FROM dbo.vendas
        WHERE CAST(vendido_em AS DATE) = @data
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao gerar relatorio.", detail: err.message });
  }
});

app.get("/api/export/vendas.xlsx", async (_req, res) => {
  try {
    const conn = await getPool();
    const result = await conn.request().query(`
      SELECT v.id, p.nome AS produto, v.quantidade, v.total, v.vendido_em
      FROM dbo.vendas v
      INNER JOIN dbo.produtos p ON p.id = v.produto_id
      ORDER BY v.id DESC
    `);

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Vendas");
    ws.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Produto", key: "produto", width: 30 },
      { header: "Quantidade", key: "quantidade", width: 15 },
      { header: "Total", key: "total", width: 15 },
      { header: "Data", key: "vendido_em", width: 24 },
    ];
    result.recordset.forEach((row) => ws.addRow(row));

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=vendas.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: "Erro ao exportar Excel.", detail: err.message });
  }
});

app.get("/api/export/vendas.pdf", async (_req, res) => {
  try {
    const conn = await getPool();
    const result = await conn.request().query(`
      SELECT TOP 200 v.id, p.nome AS produto, v.quantidade, v.total, v.vendido_em
      FROM dbo.vendas v
      INNER JOIN dbo.produtos p ON p.id = v.produto_id
      ORDER BY v.id DESC
    `);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=vendas.pdf");
    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);
    doc.fontSize(16).text("Relatorio de Vendas", { underline: true });
    doc.moveDown();
    doc.fontSize(10);
    result.recordset.forEach((v) => {
      doc.text(
        `ID ${v.id} | ${v.produto} | Qtd: ${v.quantidade} | Total: R$ ${Number(v.total).toFixed(
          2
        )} | ${new Date(v.vendido_em).toLocaleString("pt-BR")}`
      );
    });
    doc.end();
  } catch (err) {
    res.status(500).json({ error: "Erro ao exportar PDF.", detail: err.message });
  }
});

// ── LISTAR CLIENTES ──────────────────────────────────────
app.get("/api/clientes", async (_req, res) => {
  try {
    const conn = await getPool();
    const result = await conn.request().query(
      "SELECT id, tipo, nome, documento, telefone, email, endereco, criada_em FROM dbo.Pessoas ORDER BY id DESC"
    );
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar clientes.", detail: err.message });
  }
});

// ── CADASTRAR CLIENTE ────────────────────────────────────
app.post("/api/clientes", async (req, res) => {
  const { tipo, nome, documento, telefone, email, endereco } = req.body;
  if (!nome || !tipo) {
    return res.status(400).json({ error: "Informe pelo menos tipo e nome." });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = 3000;
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Sistema Mercado rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Falha ao iniciar aplicacao:", err.message);
    process.exit(1);
  });
