import { db } from "../firebase/firebase-init.js";
import {
  doc, getDoc, updateDoc, collection, query, where, onSnapshot, getDocs, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const token = params.get("t");
const masterKey = params.get("k");

const LOCAL_KEY = token ? `amigoRevelado_${token}` : null;

const revealContainer = document.getElementById("revealContainer");
const revealName = document.getElementById("revealName");
const giftBoxWrapper = document.getElementById("giftBoxWrapper");
const painelRevelar = document.getElementById("painelRevelar");
const infoRevelar = document.getElementById("infoRevelar");

// AES-GCM decodificação
async function decryptAES(masterKeyBase64, base64Data) {
  const keyBytes = Uint8Array.from(
    atob(masterKeyBase64.replace(/-/g, "+").replace(/_/g, "/")),
    c => c.charCodeAt(0)
  );

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const data = Uint8Array.from(
    atob(base64Data.replace(/-/g, "+").replace(/_/g, "/")),
    c => c.charCodeAt(0)
  );

  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

async function init() {

  if (!token || !masterKey) {
    revealName.textContent = "Link inválido.";
    return;
  }

  const linkRef = doc(db, "amigo_links", token);
  const snap = await getDoc(linkRef);

  if (!snap.exists()) {
    revealName.textContent = "Link não encontrado.";
    return;
  }

  const dados = snap.data();

  // ---------- CASO 1: link já foi usado ----------
  if (dados.used) {
    const salvoLocal = LOCAL_KEY ? localStorage.getItem(LOCAL_KEY) : null;

    if (!salvoLocal) {
      // Outro dispositivo tentando usar um link já revelado
      document.getElementById("dicaArea").style.display = "none";
      document.getElementById("dicaRecebida").style.display = "none";

      revealName.textContent =
        "Este link já foi usado para revelar o amigo secreto. 🎄";
      revealName.style.display = "block";

      // Mesmo assim mostra o painel de progresso do grupo
      iniciarPainel(dados.groupId);
      return;
    }

    // Mesmo dispositivo que já revelou antes → pode ver de novo a partir do localStorage
    const amigo = salvoLocal;

    // Mostra nome
    revealName.textContent = amigo;
    revealName.style.display = "block";

    // Mostra caixa (sem impedir nada)
    giftBoxWrapper.style.display = "flex";

    // Habilita área pra deixar dica
    document.getElementById("dicaArea").style.display = "block";

    if (dados.dica) {
      document.getElementById("dicaTexto").value = dados.dica;
    }

    // Escutar dica do amigo revelado
    iniciarDicaDoAmigo(amigo, dados.groupId);

    // Progresso do grupo
    iniciarPainel(dados.groupId);

    document.getElementById("btnSalvarDica").onclick = async () => {
      const btn = document.getElementById("btnSalvarDica");
      const texto = document.getElementById("dicaTexto").value.trim();

      if (texto === "") {
        await showAlert("Digite sua dica antes de salvar!");
        return;
      }

      // Estado "salvando"
      btn.textContent = "Salvando dica...";
      btn.classList.add("btn-loading");
      btn.disabled = true;

      try {
        await updateDoc(linkRef, {
          dica: texto
        });

        await showAlert("Dica salva com sucesso! 🎁");
      } catch (error) {
        console.error(error);
        await showAlert("Erro ao salvar a dica, tente novamente.");
      }

      // Volta ao estado normal
      btn.textContent = "Salvar dica";
      btn.classList.remove("btn-loading");
      btn.disabled = false;
    };

    return;
  }

  // ---------- CASO 2: link AINDA NÃO FOI usado ----------
  // Aqui é a primeira vez que alguém está abrindo esse link

  // Decripta usando a masterKey salva no doc (não dependemos do k da URL)
  const amigo = await decryptAES(dados.masterKey, dados.assigned);

  // Salva localmente para este dispositivo poder ver de novo depois
  if (LOCAL_KEY) {
    localStorage.setItem(LOCAL_KEY, amigo);
  }

  document.getElementById("dicaArea").style.display = "block";

  // Revelar na tela
  revealName.textContent = amigo;
  revealName.style.display = "block";

  // Marca como usado se ainda não foi
  await updateDoc(linkRef, {
    used: true,
    usedAt: new Date().toISOString()
  });

  // Atualiza o total de revelados do grupo
  await updateDoc(doc(db, "amigo_grupos", dados.groupId), {
    revelados: increment(1)
  });

  if (dados.dica) {
    document.getElementById("dicaTexto").value = dados.dica;
  }

  // Escutar dica do amigo revelado
  iniciarDicaDoAmigo(amigo, dados.groupId);

  // Exibe caixa animada
  giftBoxWrapper.style.display = "flex";

  // 🎉 Soltar confetes
  confetti({
    particleCount: 200,
    spread: 80,
    origin: { y: 0.2 }
  });

  // Atualiza painel de progresso do grupo
  iniciarPainel(dados.groupId);

  document.getElementById("btnSalvarDica").onclick = async () => {
    const texto = document.getElementById("dicaTexto").value.trim();

    await updateDoc(linkRef, {
      dica: texto
    });

    await showAlert("Dica salva com sucesso! 🎁");
  };
}

// Escutar em tempo real a dica do amigo revelado
function iniciarDicaDoAmigo(amigo, groupId) {
  const q = query(
    collection(db, "amigo_links"),
    where("owner", "==", amigo),
    where("groupId", "==", groupId)
  );

   // ESCUTAR EM TEMPO REAL a dica do amigo revelado
  onSnapshot(q, (snapDica) => {
    const divRecebida = document.getElementById("dicaRecebida");
    const divTexto = document.getElementById("dicaTextoRecebida");
    const divVazia = document.getElementById("dicaVazia");

    if (snapDica.empty) {
      divRecebida.style.display = "block";
      divTexto.style.display = "none";
      divVazia.style.display = "block";
      return;
    }

    const docDica = snapDica.docs[0].data();
    const dica = docDica.dica ? docDica.dica.trim() : "";

    // Sempre mostrar o bloco
    divRecebida.style.display = "block";

    if (dica !== "") {
      divTexto.textContent = dica;
      divTexto.style.display = "block";
      divVazia.style.display = "none";
    } else {
      divTexto.style.display = "none";
      divVazia.style.display = "block";
    }
  });
}

function iniciarPainel(groupId) {

  const q = query(
    collection(db, "amigo_links"),
    where("groupId", "==", groupId)
  );

  painelRevelar.style.display = "block";

  onSnapshot(q, (snapshot) => {
    let usados = 0;
    let total = 0;

    snapshot.forEach(docSnap => {
      total++;
      if (docSnap.data().used) usados++;
    });

    infoRevelar.innerHTML = `
      <b>${usados}</b> de <b>${total}</b> revelaram
    `;
  });
}

init();