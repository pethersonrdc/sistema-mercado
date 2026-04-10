const produtoForm = document.getElementById("produtoForm");
const vendaForm = document.getElementById("vendaForm");
const loginForm = document.getElementById("loginForm");
const relatorioForm = document.getElementById("relatorioForm");
const produtosBody = document.getElementById("produtosBody");
const vendasBody = document.getElementById("vendasBody");
const produtoSelect = document.getElementById("produtoSelect");
const exportExcel = document.getElementById("exportExcel");
const exportPdf = document.getElementById("exportPdf");
const caixaInfo = document.getElementById("caixaInfo");
const msg = document.getElementById("msg");
let token = localStorage.getItem("mercado_token") || "";

function moeda(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function showMessage(texto, erro = false) {
  msg.textContent = texto;
  msg.style.color = erro ? "#b91c1c" : "#047857";
  setTimeout(() => {
    msg.textContent = "";
  }, 3000);
}

async function carregarProdutos() {
  const resposta = await apiFetch("/api/produtos");
  const produtos = await resposta.json();

  produtosBody.innerHTML = "";
  produtoSelect.innerHTML = "<option value=''>Selecione o produto</option>";

  produtos.forEach((p) => {
    produtosBody.innerHTML += `
      <tr>
        <td>${p.id}</td>
        <td>${p.nome}</td>
        <td>${moeda(p.preco)}</td>
        <td>${p.estoque}</td>
      </tr>
    `;

    produtoSelect.innerHTML += `<option value="${p.id}">${p.nome} (Estoque: ${p.estoque})</option>`;
  });
}

async function carregarVendas() {
  const resposta = await apiFetch("/api/vendas");
  const vendas = await resposta.json();
  vendasBody.innerHTML = "";

  vendas.forEach((v) => {
    vendasBody.innerHTML += `
      <tr>
        <td>${v.id}</td>
        <td>${v.produto}</td>
        <td>${v.quantidade}</td>
        <td>${moeda(v.total)}</td>
        <td>${new Date(v.vendido_em).toLocaleString("pt-BR")}</td>
      </tr>
    `;
  });
}

async function apiFetch(url, options = {}) {
  const headers = options.headers || {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const resposta = await fetch(url, { ...options, headers });
  if (resposta.status === 401) {
    showMessage("Sessao expirada. Faca login novamente.", true);
  }
  return resposta;
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const usuario = document.getElementById("usuario").value.trim();
  const senha = document.getElementById("senha").value;

  const resposta = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, senha }),
  });

  const data = await resposta.json();
  if (!resposta.ok) {
    showMessage(data.error || "Falha no login.", true);
    return;
  }

  token = data.token;
  localStorage.setItem("mercado_token", token);
  showMessage(`Login realizado: ${data.usuario}`);
  await carregarProdutos();
  await carregarVendas();
});

produtoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("nome").value.trim();
  const preco = document.getElementById("preco").value;
  const estoque = document.getElementById("estoque").value;

  const resposta = await apiFetch("/api/produtos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, preco, estoque }),
  });

  if (!resposta.ok) {
    const err = await resposta.json();
    showMessage(err.error || "Erro ao salvar produto.", true);
    return;
  }

  produtoForm.reset();
  showMessage("Produto cadastrado com sucesso.");
  await carregarProdutos();
});

vendaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const produto_id = document.getElementById("produtoSelect").value;
  const quantidade = document.getElementById("quantidade").value;

  const resposta = await apiFetch("/api/vendas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ produto_id, quantidade }),
  });

  if (!resposta.ok) {
    const err = await resposta.json();
    showMessage(err.error || "Erro ao registrar venda.", true);
    return;
  }

  vendaForm.reset();
  showMessage("Venda registrada com sucesso.");
  await carregarProdutos();
  await carregarVendas();
});

relatorioForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = document.getElementById("dataRelatorio").value;
  const resposta = await apiFetch(`/api/relatorio/caixa-dia?data=${data}`);
  const info = await resposta.json();
  if (!resposta.ok) {
    showMessage(info.error || "Erro ao consultar caixa.", true);
    return;
  }
  caixaInfo.textContent = `Data: ${info.data.slice(0, 10)} | Vendas: ${
    info.total_vendas
  } | Total: ${moeda(info.valor_total)}`;
});

exportExcel.addEventListener("click", () => {
  if (!token) {
    showMessage("Faca login primeiro.", true);
    return;
  }
  window.open(`/api/export/vendas.xlsx?token=${encodeURIComponent(token)}`, "_blank");
});

exportPdf.addEventListener("click", () => {
  if (!token) {
    showMessage("Faca login primeiro.", true);
    return;
  }
  window.open(`/api/export/vendas.pdf?token=${encodeURIComponent(token)}`, "_blank");
});

async function init() {
  try {
    if (token) {
      await carregarProdutos();
      await carregarVendas();
    }
  } catch (_e) {
    showMessage("Falha ao carregar dados. Verifique o servidor.", true);
  }
}

init();
