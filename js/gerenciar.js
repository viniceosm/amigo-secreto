import { db } from "../firebase/firebase-init.js";
import {
  doc, getDoc, collection, setDoc, getDocs, query, where, onSnapshot, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Util: gerar token aleatório
function randomToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

// Util: gerar chave AES 256 bits
async function generateMasterKey() {
  const key = crypto.getRandomValues(new Uint8Array(32)); // 256 bits
  return btoa(String.fromCharCode(...key))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Util: AES-GCM criptografar
async function encryptAES(masterKeyBase64, texto) {
  const masterKey = Uint8Array.from(atob(masterKeyBase64.replace(/-/g,"+").replace(/_/g,"/")), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    masterKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));  
  const encoded = new TextEncoder().encode(texto);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoded
  );

  const result = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.byteLength);

  // Base64URL
  return btoa(String.fromCharCode(...result))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ======= Lógica principal =======
const params = new URLSearchParams(window.location.search);
const groupId = params.get("id");

const infoGrupo = document.getElementById("infoGrupo");
const listaParticipantes = document.getElementById("listaParticipantes");
const btnSortear = document.getElementById("btnSortear");
const btnResetar = document.getElementById("btnResetar");
const linksArea = document.getElementById("linksArea");
const linksLista = document.getElementById("linksLista");

if (!groupId) {
  infoGrupo.innerHTML = "ID de grupo não informado.";
  throw "Missing ID";
}

init();

async function init() {
  console.log("init");
  const grupoSnap = await getDoc(doc(db, "amigo_grupos", groupId));

  document.getElementById("btnExcluirGrupo").addEventListener("click", excluirGrupo);

  if (!grupoSnap.exists()) {
    // Remover esse grupo da lista local
    const grupos = loadLocalGroups(); // lista atual
    const novaLista = grupos.filter(g => g.id !== groupId);

    localStorage.setItem("amigoSecretoGrupos", JSON.stringify(novaLista));

    infoGrupo.innerHTML = "Grupo não encontrado.";
    return;
  }

  const grupo = grupoSnap.data();

  renderParticipantes(grupo.participantes);

  btnSortear.style.display = "block";
  btnSortear.addEventListener("click", () => sortear(grupo));
  btnResetar.addEventListener("click", resetarSorteio);
  console.log("btnExcluirGrupo", btnExcluirGrupo);

  iniciarPainelProgresso(groupId, grupo.participantes);

  carregarLinksExistentes();
}

function iniciarPainelProgresso(groupId, participantes) {

  const painel = document.getElementById("painelProgresso");
  painel.style.display = "block";

  const contador = document.getElementById("contador");
  const listaStatus = document.getElementById("listaStatus");

  const q = query(
    collection(db, "amigo_links"),
    where("groupId", "==", groupId)
  );

  onSnapshot(q, (snapshot) => {

    if (snapshot.empty) {
      btnResetar.style.display = "none";
      btnSortear.style.display = "block";
    } else {
      btnResetar.style.display = "block";
      btnSortear.style.display = "none";
    }

    const usados = [];
    const pendentes = [];

    snapshot.forEach(docSnap => {
      const d = docSnap.data();

      if (d.used) {
        usados.push({
          name: d.owner,
          usedAt: d.usedAt
        });
      } else {
        pendentes.push({
          name: d.owner
        });
      }
    });

    const total = participantes.length;
    const revelados = usados.length;

    // Exibir contador
    contador.innerHTML = `
      <b>${revelados}</b> de <b>${total}</b> revelaram
    `;

    // Montar lista
    let html = "";

    // Primeiro revelados
    usados
      .sort((a,b)=> new Date(a.usedAt)-new Date(b.usedAt))
      .forEach(u => {
        const dt = new Date(u.usedAt);
        const dia = dt.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" });
        const hora = dt.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });

        html += `
          <div style="margin:4px 0">
            ✔ <b>${u.name}</b> — ${dia} ${hora}
          </div>
        `;
      });

    // Depois pendentes
    pendentes.forEach(p => {
      html += `
        <div style="margin:4px 0;opacity:.7">
          ❌ <b>${p.name}</b> — aguardando
        </div>
      `;
    });

    listaStatus.innerHTML = html;
  });

  onSnapshot(doc(db, "amigo_grupos", groupId), (snap) => {
    const grupo = snap.data();
    infoGrupo.innerHTML = `
      Grupo: <b>${grupo.nome}</b><br>
      Participantes: ${grupo.quantidade}<br>
      Revelados: ${grupo.revelados}
    `;
  });
}

// Mostrar participantes
function renderParticipantes(lista) {
  document.getElementById("participantesArea").style.display = "block";

  listaParticipantes.innerHTML = "";
  lista.forEach(p => {
    const li = document.createElement("li");
    li.textContent = p;
    li.style.marginBottom = "6px";
    listaParticipantes.appendChild(li);
  });
}

// ======= Sorteio + geração de links =======
async function sortear(grupo) {

  btnSortear.disabled = true;
  btnSortear.textContent = "Gerando links...";

  // DERANGEMENT — garante que ninguém tira a si mesmo
  const participantes = gerarDerangement(grupo.participantes);

  const pares = {};
  for (let i = 0; i < grupo.participantes.length; i++) {
    const pessoa = grupo.participantes[i];
    const amigo = participantes[i];
    pares[pessoa] = amigo;
  }

  const colLinks = collection(db, "amigo_links");

  linksLista.innerHTML = "";
  linksArea.style.display = "block";

  // Criar links
  for (const pessoa of grupo.participantes) {

    const amigo = pares[pessoa];

    const token = randomToken();
    const masterKey = await generateMasterKey();
    const cripto = await encryptAES(masterKey, amigo);

    await setDoc(doc(colLinks, token), {
      owner: pessoa,
      groupId,
      assigned: cripto,
      masterKey,
      used: false,
      usedAt: null
    });

    const url = `https://viniceosm.github.io/amigo-secreto/revelar.html?t=${token}&k=${masterKey}`;

    const div = document.createElement("div");
    div.style.marginBottom = "15px";

    div.innerHTML = `
      <b>${pessoa}:</b><br>
      <div class="link-row">
        <input id="link_${token}" class="link-input" value="${url}">
        <button class="btn-share" onclick="compartilharLink('${pessoa}', '${url}')">📤</button>
      </div>
    `;

    btnResetar.style.display = "block";
    btnResetar.disabled = false;
    btnResetar.textContent = "🔄 Resetar Sorteio";

    linksLista.appendChild(div);
  }

  document.getElementById("participantesArea").style.display = "none";

  btnSortear.style.display = "none";
  btnResetar.style.display = "block";
}

function gerarDerangement(lista) {
  let tentativas = 0;
  let embaralhado = [];

  do {
    tentativas++;
    embaralhado = [...lista];

    // shuffle
    for (let i = embaralhado.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [embaralhado[i], embaralhado[j]] = [embaralhado[j], embaralhado[i]];
    }

    // verifica se alguém caiu consigo mesmo
    const invalido = embaralhado.some((p, i) => p === lista[i]);

    if (!invalido) return embaralhado;

  } while (tentativas < 50);

  throw new Error("Não foi possível gerar um derangement");
}

async function resetarSorteio() {

  const ok = await showConfirm("Tem certeza que deseja resetar o sorteio? Os links serão apagados e será necessário sortear novamente.");

  if (!ok) return;

  btnResetar.disabled = true;
  btnResetar.textContent = "Resetando...";

  // 1. Apagar todos os links do grupo
  const q = query(
    collection(db, "amigo_links"),
    where("groupId", "==", groupId)
  );

  const snapshot = await getDocs(q);

  for (const docSnap of snapshot.docs) {
    await deleteDoc(docSnap.ref);   // <-- AQUI ESTÁ A CORREÇÃO
  }

  // 2. Resetar campo "revelados" do grupo
  await updateDoc(doc(db, "amigo_grupos", groupId), {
    revelados: 0
  });

  // 3. Resetar UI
  linksLista.innerHTML = "";
  linksArea.style.display = "none";
  btnResetar.style.display = "none";

  btnSortear.style.display = "block";
  btnSortear.disabled = false;
  btnSortear.textContent = "Gerar links novamente 🎁";

  document.getElementById("participantesArea").style.display = "block";

  await showAlert("Sorteio resetado com sucesso!");
}

async function excluirGrupo() {

  const ok = await showConfirm(`
    Tem certeza que deseja <b>excluir este grupo</b>?<br><br>
    ✔ Todos os links serão apagados<br>
    ✔ O grupo deixará de existir<br><br>
    Esta ação <b>não pode ser desfeita</b>.
  `);

  if (!ok) return;

  // 1. Apagar todos os links associados
  const q = query(
    collection(db, "amigo_links"),
    where("groupId", "==", groupId)
  );

  const snapshot = await getDocs(q);
  for (const docSnap of snapshot.docs) {
    await deleteDoc(docSnap.ref);
  }

  // 2. Apagar o grupo
  await deleteDoc(doc(db, "amigo_grupos", groupId));

  // 3. Avisar e redirecionar
  await showAlert("Grupo excluído com sucesso!");

  window.location.href = "index.html";
}

async function carregarLinksExistentes() {
  const q = query(
    collection(db, "amigo_links"),
    where("groupId", "==", groupId)
  );

  const snap = await getDocs(q);

  if (snap.empty) return;

  linksArea.style.display = "block";
  linksLista.innerHTML = "";

  snap.forEach(docSnap => {
    const d = docSnap.data();
    const token = docSnap.id;

    // Atenção: masterKey não é salva — você precisa salvar no Firestore também!
    const masterKey = d.masterKey; // <-- vamos resolver isso já já

    const url = `https://viniceosm.github.io/amigo-secreto/revelar.html?t=${token}&k=${masterKey}`;

    const div = document.createElement("div");

    div.innerHTML = `
      <b>${d.owner}:</b><br>
      <div class="link-row">
        <input id="link_${token}" class="link-input" value="${url}">
        <button class="btn-share" onclick="compartilharLink('${d.owner}', '${url}')">📤</button>
      </div>
    `;

    linksLista.appendChild(div);
  });
}

window.compartilharLink = async function(pessoa, url) {

  const titulo = `Amigo Secreto - ${pessoa}`;
  const texto = `Seu link para revelar o amigo secreto:`;

  // ✔ Navegadores modernos + celular
  if (navigator.share) {
    try {
      await navigator.share({
        title: titulo,
        text: texto,
        url: url
      });
    } catch (err) {
      console.error("Erro ao compartilhar:", err);
      await showAlert("Não foi possível compartilhar no dispositivo.");
    }
    return;
  }

  // ✔ Fallback: copiar link automaticamente (PC)
  try {
    await navigator.clipboard.writeText(url);
    await showAlert("Link copiado!");
  } catch {
    await showAlert(`
      Não foi possível copiar automaticamente.<br>
      Clique no link abaixo para copiar manualmente:<br><br>
      <span style="word-break:break-all; font-weight:bold;">${url}</span>
    `);
  }
};

function loadLocalGroups() {
  return JSON.parse(localStorage.getItem("amigoSecretoGrupos") || "[]");
}

function saveLocalGroup(g) {
  const list = loadLocalGroups();
  list.push(g);
  localStorage.setItem("amigoSecretoGrupos", JSON.stringify(list));
}