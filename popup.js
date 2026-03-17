// popup.js - Lógica de Drag-and-Drop e Conversão de Ficheiros

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const statusBadge = document.getElementById('status');

// Utilitário para formatar tamanho de arquivo
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Utilitário para ler arquivo como Base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

// --- A FUNÇÃO QUE FALTAVA (Comunicação com o Motor FFmpeg) ---
async function convertAudioWithTemp(id) {
    try {
        // Verifica se o motor invisível já está rodando
        const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
        if (existingContexts.length === 0) {
            await chrome.offscreen.createDocument({
                url: 'offscreen.html', reasons: ['WORKERS'], justification: 'Conversão popup'
            });
        }
        return new Promise((resolve) => {
            // Manda a ordem de conversão para o Motor
            chrome.runtime.sendMessage({ action: 'CONVERT_AUDIO_TEMP', id: id }, response => {
                resolve(response && response.success);
            });
        });
    } catch (e) {
        console.error("❌ Falha ao preparar Offscreen via Popup:", e);
        return false;
    }
}

// Configuração do Drag-and-Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});

// Configuração do Clique
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

// Processar Ficheiros Selecionados
async function handleFiles(files) {
    if (files.length === 0) return;
    
    statusBadge.textContent = "Processando";
    statusBadge.className = "processing";

    for (const file of files) {
        if (!file.type.startsWith('audio/')) {
            alert(`O ficheiro ${file.name} não é um áudio válido.`);
            continue;
        }
        await processarFicheiroPopup(file);
    }

    statusBadge.textContent = "Pronto";
    statusBadge.className = "idle";
}

// Lógica de Conversão e Injeção na Lista
async function processarFicheiroPopup(file) {
    const messageId = `popup_${crypto.randomUUID()}`;
    
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.innerHTML = `
        <div class="file-info">
            <span class="file-name">${file.name}</span>
            <span class="file-meta">Original: ${formatBytes(file.size)}</span>
        </div>
        <div class="loader"></div>
    `;
    fileList.prepend(fileItem);

    try {
        const base64Raw = await fileToBase64(file);
        const byteCharacters = atob(base64Raw);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) { byteArray[i] = byteCharacters.charCodeAt(i); }
        const rawBlob = new Blob([byteArray], { type: file.type });
        
        await guardarNoTemp(messageId, rawBlob);

        const success = await convertAudioWithTemp(messageId);

        if (!success) throw new Error("Motor falhou.");

        const oggBlob = await lerDoTemp(messageId);
        
        const downloadUrl = URL.createObjectURL(oggBlob);
        const finalFileName = `${file.name.split('.').slice(0, -1).join('.')}_Millow.ogg`;

        fileItem.innerHTML = `
            <div class="file-info">
                <span class="file-name">${finalFileName}</span>
                <span class="file-meta">Gerado: ${formatBytes(oggBlob.size)}</span>
            </div>
            <a href="${downloadUrl}" download="${finalFileName}" class="btn-download">Download</a>
        `;
        
        limparTemp(messageId).catch(()=>{});

    } catch (error) {
        console.error("❌ Erro no popup:", error);
        fileItem.innerHTML = `
            <div class="file-info">
                <span class="file-name">Erro: ${file.name}</span>
                <span class="file-meta">Falha na conversão</span>
            </div>
            <span style="color:red; font-size:1.5rem">❌</span>
        `;
        limparTemp(messageId).catch(()=>{});
    }
}