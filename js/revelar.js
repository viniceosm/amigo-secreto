import { db } from "../firebase/firebase-init.js";
import {
  doc,
  getDoc,
  updateDoc,
  increment,
  collection,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// =========================
// ELEMENTOS DA TELA
// =========================
const mensagem = document.getElementById("mensagem");
const painelRevelar = document.getElementById("painelRevelar");
const infoRevelar = document.getElementById("infoRevelar");

// =========================
// CONFETTI
// =========================
function startConfetti() {
  const duration = 2500;
  const end = Date.now() + duration;

  (function frame() {
    confetti({
      particleCount: 6,
      spread: 70,
      startVelocity: 40,
      ticks: 150,
      origin: { y: 0 }
    });

    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

// =========================
// BASE64 URL → BYTES
// =========================
function base64UrlToBytes(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";

  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  return bytes;
}

// =========================
// DESCRIPTOGRAFAR AES-GCM
// =========================
async function decryptAES(masterKey, encrypted) {
  const keyBytes = base64UrlToBytes(masterKey);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const dataBytes = base64UrlToBytes(encrypted);
  const iv = dataBytes.slice(0, 12);
  const ciphertext = dataBytes.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

// =========================
// PAINEL DO PROGRESSO
// =========================
function iniciarPainelRevelar(groupId, total) {
  painelRevelar.style.display = "block";

  const q = query(
    collection(db, "amigo_links"),
    where("groupId", "==", groupId)
  );

  onSnapshot(q, (snapshot) => {
    let usados = 0;
    snapshot.forEach(docSnap => {
      if (docSnap.data().used) usados++;
    });

    infoRevelar.innerHTML = `
      <b>${usados}</b> de <b>${total}</b> revelaram
    `;
  });
}

// =========================
// ANIMAR REVELAÇÃO
// =========================
function animarRevelacao(nome) {
  mensagem.style.opacity = 0;

  setTimeout(() => {
    mensagem.innerHTML = `<div class="revealed-name">${nome}</div>`;
    mensagem.style.opacity = 1;
    startConfetti();
  }, 400);
}

// =========================
// REMOVER masterkey DA URL
// =========================
function limparMasterKey() {
  const url = new URL(location.href);
  url.searchParams.delete("k");
  history.replaceState({}, "", url.toString());
}

// =========================
// INÍCIO
// =========================
const params = new URLSearchParams(location.search);
const token = params.get("t");
const masterKey = params.get("k");

if (!token) {
  mensagem.innerHTML = "Link inválido.";
  throw "Token ausente";
}

main().catch(err => {
  console.error(err);
  mensagem.innerHTML = "Erro ao revelar seu amigo secreto.";
});

async function main() {

  // Buscar link
  const ref = doc(db, "amigo_links", token);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    mensagem.innerHTML = "Este link não existe mais.";
    return;
  }

  const d = snap.data();

  // painel de progresso
  if (d.groupId) {
    const grupoSnap = await getDoc(doc(db, "amigo_grupos", d.groupId));
    iniciarPainelRevelar(d.groupId, grupoSnap.data().quantidade);
  }

  // Já revelado no localStorage?
  const salvo = localStorage.getItem("amigo_" + token);
  if (salvo) {
    animarRevelacao(salvo);
    return;
  }

  mensagem.innerHTML = "Carregando...";

  // Já usado?
  if (d.used) {
    mensagem.innerHTML = `
      <b>Esse link já foi usado.</b><br>
      Seu amigo secreto já havia sido revelado.
    `;
    return;
  }

  // Descriptografar
  let nome;
  try {
    nome = await decryptAES(masterKey, d.assigned);
  } catch (e) {
    console.error(e);
    mensagem.innerHTML = "Não foi possível descriptografar.";
    return;
  }

  // marcar usado
  await updateDoc(ref, {
    used: true,
    usedAt: new Date().toISOString()
  });

  // incrementar revelados
  if (d.groupId) {
    await updateDoc(doc(db, "amigo_grupos", d.groupId), {
      revelados: increment(1)
    });
  }

  // salvar local
  localStorage.setItem("amigo_" + token, nome);

  // remover key
  limparMasterKey();

  // animar!
  animarRevelacao(nome);
}
