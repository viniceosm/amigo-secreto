import { db } from "../firebase/firebase-init.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// -------- LocalStorage utils ----------
function loadLocalGroups() {
  return JSON.parse(localStorage.getItem("amigoSecretoGrupos") || "[]");
}

function saveLocalGroup(g) {
  const list = loadLocalGroups();
  list.push(g);
  localStorage.setItem("amigoSecretoGrupos", JSON.stringify(list));
}

// -------- UI logic ----------
const btnCriar = document.getElementById("btnCriar");

btnCriar.addEventListener("click", criarGrupo);

async function criarGrupo() {
  const btn = document.getElementById("btnCriar");
  btn.textContent = "Criando grupo...";
  btn.disabled = true;

  const nome = document.getElementById("grupo").value.trim();
  const lista = document.getElementById("participantes").value.trim();

  if (!nome || !lista) {
    await showAlert("Preencha todos os campos!");
    btn.textContent = "Criar grupo 🎄";
    btn.disabled = false;
    return;
  }

  const participantes = lista.split("\n").map(s => s.trim()).filter(s => s);
  const quantidade = participantes.length;

  // Firestore
  const docRef = await addDoc(collection(db, "amigo_grupos"), {
    nome,
    participantes,
    quantidade,
    revelados: 0,
    criadoEm: new Date().toISOString()
  });

  // Local
  saveLocalGroup({
    id: docRef.id,
    nome,
    quantidade,
    criadoEm: new Date().toISOString()
  });

  window.location.reload();
}

// -------- Inicialização da página --------
const grupos = loadLocalGroups();

// Botão "Criar outro grupo 🎄"
const btnNovo = document.getElementById("btnNovoGrupo");

btnNovo.addEventListener("click", () => {
  // reexibir o formulário
  document.getElementById("formArea").style.display = "block";

  // esconder a área dos grupos
  document.getElementById("grupoArea").innerHTML = "";

  // esconder o botão novamente
  btnNovo.style.display = "none";

  // limpar campos
  document.getElementById("grupo").value = "";
  document.getElementById("participantes").value = "";
});

// Lógica atual dos grupos
if (grupos.length === 1) {
  renderGrupo(grupos[0]);
  document.getElementById("formArea").style.display = "none";
  btnNovo.style.display = "block"; // <--- mostrar botão
}

if (grupos.length > 1) {
  renderLista(grupos);
  document.getElementById("formArea").style.display = "none";
  btnNovo.style.display = "block"; // <--- mostrar botão
}

if (grupos.length > 1) {
  renderLista(grupos);
}

function renderGrupo(g) {
  const area = document.getElementById("grupoArea");
  area.innerHTML = `
    <div class="card">
      <h3>${g.nome}</h3>
      <p><b>ID:</b> ${g.id}</p>
      <p><b>Participantes:</b> ${g.quantidade}</p>
      <button onclick="window.location.href='gerenciar.html?id=${g.id}'">
        Abrir grupo 🎁
      </button>
    </div>
  `;
}

function renderLista(list) {
  const area = document.getElementById("grupoArea");
  let html = `<div class="card"><h3>Seus grupos</h3>`;
  list.forEach(g => {
    html += `
      <button style="background:#1c81d8;margin-top:10px"
        onclick='window.location.href="gerenciar.html?id=${g.id}"'>
        ${g.nome} (${g.quantidade} pessoas)
      </button>
    `;
  });
  html += `</div>`;
  area.innerHTML = html;
}