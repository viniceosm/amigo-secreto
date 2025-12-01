import { db } from "../firebase/firebase-init.js";
import {
  doc, getDoc, updateDoc, collection, query, where, onSnapshot, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const token = params.get("t");
const masterKey = params.get("k");

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

  const amigo = await decryptAES(dados.masterKey, dados.assigned);

  document.getElementById("dicaArea").style.display = "block";

  // Revelar na tela
  revealName.textContent = amigo;
  revealName.style.display = "block";

  // Marca como usado se ainda não foi
  if (!dados.used) {
    await updateDoc(linkRef, {
      used: true,
      usedAt: new Date().toISOString()
    });
  }

  if (dados.dica) {
    document.getElementById("dicaTexto").value = dados.dica;
  }

  // Busca a dica do amigo revelado
  const q = query(
    collection(db, "amigo_links"),
    where("owner", "==", amigo)
  );

  const snapDica = await getDocs(q);

  if (!snapDica.empty) {
    const docDica = snapDica.docs[0].data();

    if (docDica.dica && docDica.dica.trim() !== "") {
      document.getElementById("dicaTextoRecebida").textContent = docDica.dica;
      document.getElementById("dicaRecebida").style.display = "block";
    }
  }

  // Exibe caixa animada
  giftBoxWrapper.style.display = "flex";

  // 🎉 Soltar confetes
  confetti({
    particleCount: 200,
    spread: 80,
    origin: { y: 0.2 }
  });

  // Atualiza progresso do grupo
  iniciarPainel(dados.groupId);

  document.getElementById("btnSalvarDica").onclick = async () => {

    const texto = document.getElementById("dicaTexto").value.trim();
  
    await updateDoc(linkRef, {
      dica: texto
    });
  
    await showAlert("Dica salva com sucesso! 🎁");
  };
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