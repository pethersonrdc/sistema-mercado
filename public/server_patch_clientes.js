/* ══════════════════════════════════════════════════════════
   PATCH — server.js
   Adicione estas rotas ANTES da linha:
   app.use((_req, res) => { ... });
══════════════════════════════════════════════════════════ */

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

  try {
    const conn = await getPool();
    await conn
      .request()
      .input("tipo",      sql.NVarChar(10),  tipo      || null)
      .input("nome",      sql.NVarChar(150), nome)
      .input("documento", sql.NVarChar(30),  documento || null)
      .input("telefone",  sql.NVarChar(30),  telefone  || null)
      .input("email",     sql.NVarChar(120), email     || null)
      .input("endereco",  sql.NVarChar(255), endereco  || null)
      .query(`
        INSERT INTO dbo.Pessoas (tipo, nome, documento, telefone, email, endereco)
        VALUES (@tipo, @nome, @documento, @telefone, @email, @endereco)
      `);

    res.status(201).json({ message: "Cliente cadastrado com sucesso." });
  } catch (err) {
    res.status(500).json({ error: "Erro ao cadastrar cliente.", detail: err.message });
  }
});
