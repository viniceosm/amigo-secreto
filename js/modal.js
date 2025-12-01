// ===== ALERT CUSTOMIZADO =====
window.showAlert = function (mensagem) {
    return new Promise(resolve => {
      
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
  
      overlay.innerHTML = `
        <div class="modal-box">
          <h2>Aviso</h2>
          <p>${mensagem}</p>
          <button class="modal-btn modal-btn-ok">OK</button>
        </div>
      `;
  
      document.body.appendChild(overlay);
  
      overlay.querySelector(".modal-btn-ok").onclick = () => {
        overlay.remove();
        resolve();
      };
    });
  };
  
  // ===== CONFIRM CUSTOMIZADO =====
  window.showConfirm = function (mensagem) {
    return new Promise(resolve => {
      
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
  
      overlay.innerHTML = `
        <div class="modal-box">
          <h2>Confirmar</h2>
          <p>${mensagem}</p>
  
          <button class="modal-btn modal-btn-ok">Confirmar</button>
          <button class="modal-btn modal-btn-cancel">Cancelar</button>
        </div>
      `;
  
      document.body.appendChild(overlay);
  
      overlay.querySelector(".modal-btn-ok").onclick = () => {
        overlay.remove();
        resolve(true);
      };
  
      overlay.querySelector(".modal-btn-cancel").onclick = () => {
        overlay.remove();
        resolve(false);
      };
    });
  };
  