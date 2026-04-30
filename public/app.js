/* ════════════════════════════════════════════════
   PH SUPERMARKET — APP.JS
   Lógica de navegação, API e animações
════════════════════════════════════════════════ */

// ─── TOKEN ───────────────────────────────────────
let token = localStorage.getItem("mercado_token") || "";

// ─── ELEMENTOS ───────────────────────────────────
const telaLogin      = document.getElementById("telaLogin");
const telaPrincipal  = document.getElementById("telaPrincipal");
const loginForm      = document.getElementById("loginForm");
const produtoForm    = document.getElementById("produtoForm");
const vendaForm      = document.getElementById("vendaForm");
const relatorioForm  = document.getElementById("relatorioForm");
const clienteForm    = document.getElementById("clienteForm");
const produtosBody   = document.getElementById("produtosBody");
const vendasBody     = document.getElementById("vendasBody");
const estoqueBody    = document.getElementById("estoqueBody");
const clientesBody   = document.getElementById("clientesBody");
const produtoSelect  = document.getElementById("produtoSelect");
const exportExcel    = document.getElementById("exportExcel");
const exportPdf      = document.getElementById("exportPdf");
const caixaInfo      = document.getElementById("caixaInfo");
const headerUser     = document.getElementById("headerUser");
const btnLogout      = document.getElementById("btnLogout");
const toast          = document.getElementById("toast");
const successOverlay = document.getElementById("successOverlay");
const successMsg     = document.getElementById("successMsg");

// ─── FORMATAÇÃO ──────────────────────────────────
function moeda(valor) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── TOAST ───────────────────────────────────────
let toastTimer = null;

function showToast(texto, erro = false) {
  clearTimeout(toastTimer);
  toast.textContent = texto;
  toast.className = "toast " + (erro ? "erro" : "ok") + " visivel";
  toastTimer = setTimeout(() => {
    toast.classList.remove("visivel");
  }, 3500);
}

// ─── OVERLAY DE SUCESSO ───────────────────────────
function showSuccess(msg, duracao = 2000) {
  successMsg.textContent = msg;
  successOverlay.classList.remove("oculto");
  setTimeout(() => {
    successOverlay.classList.add("oculto");
  }, duracao);
}

// ─── API FETCH ────────────────────────────────────
async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    showToast("Sessão expirada. Faça login novamente.", true);
    logout();
  }
  return res;
}

// ─── NAVEGAÇÃO ENTRE TELAS ───────────────────────
const navBtns  = document.querySelectorAll(".nav-btn");
const paineis  = {
  dashboard : document.getElementById("painelDashboard"),
  produtos  : document.getElementById("painelProdutos"),
  vendas    : document.getElementById("painelVendas"),
  clientes  : document.getElementById("painelClientes"),
  estoque   : document.getElementById("painelEstoque"),
};

function irPara(tela) {
  // Atualiza botões do nav
  navBtns.forEach(btn => {
    btn.classList.toggle("ativo", btn.dataset.tela === tela);
  });

  // Troca painel
  Object.entries(paineis).forEach(([key, el]) => {
    el.classList.toggle("ativo", key === tela);
    el.classList.toggle("oculto", key !== tela);
  });

  // Carrega dados conforme painel
  if (tela === "produtos")  carregarProdutos();
  if (tela === "vendas")    carregarVendas();
  if (tela === "clientes")  carregarClientes();
  if (tela === "estoque")   carregarEstoque();
}

navBtns.forEach(btn => {
  btn.addEventListener("click", () => irPara(btn.dataset.tela));
});

// Cards do dashboard
document.querySelectorAll(".dash-card[data-goto]").forEach(card => {
  card.addEventListener("click", () => irPara(card.dataset.goto));
});

// ─── LOGIN / LOGOUT ──────────────────────────────
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const usuario = document.getElementById("usuario").value.trim();
  const senha   = document.getElementById("senha").value;

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, senha }),
  });

  const data = await res.json();

  if (!res.ok) {
    showToast(data.error || "Credenciais inválidas.", true);
    return;
  }

  token = data.token;
  localStorage.setItem("mercado_token", token);
  headerUser.textContent = data.usuario;

  // Anima transição de tela
  telaLogin.style.opacity = "0";
  telaLogin.style.transform = "scale(0.95)";
  telaLogin.style.transition = "all 0.35s ease";

  setTimeout(() => {
    telaLogin.classList.add("oculto");
    telaPrincipal.style.display = "flex";
    telaPrincipal.style.flexDirection = "column";
    telaPrincipal.style.animation = "fadeIn 0.4s ease";
    window.scrollTo(0, 0);
    irPara("dashboard");
  }, 350);

  // Feedback de login
  setTimeout(() => {
    showSuccess("VOCÊ ESTÁ LOGADO", 2000);
  }, 500);
});

function logout() {
  token = "";
  localStorage.removeItem("mercado_token");
  telaPrincipal.style.display = "none";
  telaLogin.classList.remove("oculto");
  telaLogin.style.opacity = "1";
  telaLogin.style.transform = "scale(1)";
  loginForm.reset();
}

btnLogout.addEventListener("click", logout);

// ─── PRODUTOS ────────────────────────────────────
async function carregarProdutos() {
  try {
    const res     = await apiFetch("/api/produtos");
    const produtos = await res.json();

    produtosBody.innerHTML  = "";
    produtoSelect.innerHTML = "<option value=''>Selecione o produto</option>";

    if (!produtos.length) {
      produtosBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-dim)">Nenhum produto cadastrado</td></tr>`;
      return;
    }

    produtos.forEach(p => {
      produtosBody.innerHTML += `
        <tr>
          <td>${p.id}</td>
          <td>${p.nome}</td>
          <td>${moeda(p.preco)}</td>
          <td>${p.estoque}</td>
        </tr>`;
      produtoSelect.innerHTML += `<option value="${p.id}">${p.nome} (Estoque: ${p.estoque})</option>`;
    });
  } catch {
    showToast("Erro ao carregar produtos.", true);
  }
}

produtoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome    = document.getElementById("nome").value.trim();
  const preco   = document.getElementById("preco").value;
  const estoque = document.getElementById("estoque").value;

  const res = await apiFetch("/api/produtos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, preco, estoque }),
  });

  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || "Erro ao salvar produto.", true);
    return;
  }

  produtoForm.reset();
  await carregarProdutos();
  showSuccess("Produto em estoque cadastrado ✓", 2200);
});

// ─── VENDAS ──────────────────────────────────────
async function carregarVendas() {
  try {
    const res   = await apiFetch("/api/vendas");
    const vendas = await res.json();

    vendasBody.innerHTML = "";

    if (!vendas.length) {
      vendasBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-dim)">Nenhuma venda registrada</td></tr>`;
      return;
    }

    vendas.forEach(v => {
      vendasBody.innerHTML += `
        <tr>
          <td>${v.id}</td>
          <td>${v.produto}</td>
          <td>${v.quantidade}</td>
          <td>${moeda(v.total)}</td>
          <td>${new Date(v.vendido_em).toLocaleString("pt-BR")}</td>
        </tr>`;
    });
  } catch {
    showToast("Erro ao carregar vendas.", true);
  }
}

vendaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const produto_id = document.getElementById("produtoSelect").value;
  const quantidade = document.getElementById("quantidade").value;

  const res = await apiFetch("/api/vendas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ produto_id, quantidade }),
  });

  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || "Erro ao registrar venda.", true);
    return;
  }

  vendaForm.reset();
  await carregarVendas();
  await carregarProdutos();
  showSuccess("Venda registrada com sucesso ✓", 2200);
});

// ─── ESTOQUE ─────────────────────────────────────
async function carregarEstoque() {
  try {
    const res      = await apiFetch("/api/produtos");
    const produtos = await res.json();

    estoqueBody.innerHTML = "";

    if (!produtos.length) {
      estoqueBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-dim)">Nenhum produto</td></tr>`;
      return;
    }

    produtos.forEach(p => {
      let badge = "";
      if (p.estoque === 0)    badge = `<span class="badge badge-critico">Esgotado</span>`;
      else if (p.estoque < 5) badge = `<span class="badge badge-baixo">Baixo</span>`;
      else                    badge = `<span class="badge badge-ok">OK</span>`;

      estoqueBody.innerHTML += `
        <tr>
          <td>${p.id}</td>
          <td>${p.nome}</td>
          <td>${moeda(p.preco)}</td>
          <td>${p.estoque}</td>
          <td>${badge}</td>
        </tr>`;
    });
  } catch {
    showToast("Erro ao carregar estoque.", true);
  }
}

// ─── RELATÓRIO DE CAIXA ──────────────────────────
relatorioForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = document.getElementById("dataRelatorio").value;
  const res  = await apiFetch(`/api/relatorio/caixa-dia?data=${data}`);
  const info = await res.json();

  if (!res.ok) {
    showToast(info.error || "Erro ao consultar caixa.", true);
    return;
  }

  caixaInfo.innerHTML = `
    <div class="caixa-linha">
      <span class="caixa-key">Data</span>
      <span class="caixa-val">${info.data.slice(0, 10)}</span>
    </div>
    <div class="caixa-linha">
      <span class="caixa-key">Total de Vendas</span>
      <span class="caixa-val">${info.total_vendas}</span>
    </div>
    <div class="caixa-linha">
      <span class="caixa-key">Valor Total</span>
      <span class="caixa-val">${moeda(info.valor_total)}</span>
    </div>`;
  caixaInfo.classList.add("visivel");
});

// ─── EXPORTAÇÕES ─────────────────────────────────
exportExcel.addEventListener("click", () => {
  if (!token) { showToast("Faça login primeiro.", true); return; }
  window.open(`/api/export/vendas.xlsx?token=${encodeURIComponent(token)}`, "_blank");
});

exportPdf.addEventListener("click", () => {
  if (!token) { showToast("Faça login primeiro.", true); return; }
  window.open(`/api/export/vendas.pdf?token=${encodeURIComponent(token)}`, "_blank");
});

// ─── CLIENTES ────────────────────────────────────
// Carrega lista de clientes (tabela Pessoas)
async function carregarClientes() {
  try {
    const res      = await apiFetch("/api/clientes");
    const clientes = await res.json();

    clientesBody.innerHTML = "";

    if (!Array.isArray(clientes) || !clientes.length) {
      clientesBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dim)">Nenhum cliente cadastrado</td></tr>`;
      return;
    }

    clientes.forEach(c => {
      clientesBody.innerHTML += `
        <tr>
          <td>${c.id}</td>
          <td><span class="badge ${c.tipo === 'PJ' ? 'badge-baixo' : 'badge-ok'}">${c.tipo || '-'}</span></td>
          <td>${c.nome}</td>
          <td>${c.documento || '-'}</td>
          <td>${c.telefone || '-'}</td>
          <td>${c.email || '-'}</td>
        </tr>`;
    });
  } catch {
    showToast("Erro ao carregar clientes.", true);
  }
}

// Cadastra novo cliente
clienteForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    tipo      : document.getElementById("clienteTipo").value,
    nome      : document.getElementById("clienteNome").value.trim(),
    documento : document.getElementById("clienteDocumento").value.trim(),
    telefone  : document.getElementById("clienteTelefone").value.trim(),
    email     : document.getElementById("clienteEmail").value.trim(),
    endereco  : document.getElementById("clienteEndereco").value.trim(),
  };

  const res = await apiFetch("/api/clientes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || "Erro ao cadastrar cliente.", true);
    return;
  }

  clienteForm.reset();
  await carregarClientes();
  showSuccess("Cliente cadastrado com sucesso ✓", 2200);
});

// ─── INIT ─────────────────────────────────────────
async function init() {
  if (token) {
    // Já tem token salvo — vai direto para o painel
    telaLogin.classList.add("oculto");
    telaPrincipal.style.display = "flex";
    telaPrincipal.style.flexDirection = "column";

    // Tenta recuperar usuário do token
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      headerUser.textContent = payload.usuario || "";
    } catch { /* ignora */ }

    irPara("dashboard");
  }
}

init();
