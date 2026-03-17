// background.js - Versão Final com Trava e Rádio

importScripts('db-utility.js');

console.log("🟢 [BACKGROUND] MILLOW PRO ATIVA!");

// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = "https://SEU_PROJETO.supabase.co";
const SUPABASE_KEY = "SUA_CHAVE_ANON_KEY";

let isProcessingQueue = false; 
let offscreenCreating = null;  

// --- GESTÃO DO DOCUMENTO OFFSCREEN ---
async function setupOffscreenDocument(path) {
    if (offscreenCreating) {
        await offscreenCreating;
        return;
    }
    const offscreenUrl = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [offscreenUrl] });
    if (existingContexts.length > 0) return;

    offscreenCreating = chrome.offscreen.createDocument({
        url: path, reasons: ['WORKERS'], justification: 'Conversão nativa de áudio para WhatsApp Web'
    });
    await offscreenCreating;
    offscreenCreating = null; 
}

// --- SOLICITAR CONVERSÃO AO MOTOR ---
async function convertAudioWithTemp(id) {
    try {
        await setupOffscreenDocument('offscreen.html');
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'CONVERT_AUDIO_TEMP', id: id }, response => {
                if (chrome.runtime.lastError) {
                    console.error("❌ Erro de canal com Offscreen:", chrome.runtime.lastError);
                    resolve(false);
                } else if (response && response.success) {
                    resolve(true); 
                } else {
                    console.error("🚨 DETALHE DO ERRO DO MOTOR:", response?.error || "Erro desconhecido.");
                    resolve(false);
                }
            });
        });
    } catch (e) {
        console.error("❌ Falha ao preparar Offscreen:", e);
        return false;
    }
}

// --- UTILITÁRIOS ---
function bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); }
    return btoa(binary);
}

function getToken() { return new Promise((resolve) => { chrome.storage.local.get(['gestorToken'], (res) => resolve(res.gestorToken)); }); }

async function atualizarStatusBD(id, status) {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_queue?id=eq.${id}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: status })
        });
    } catch (e) {}
}

// --- FILA DE PROCESSAMENTO ---
async function verificarCaixaDeCorreio() {
    if (isProcessingQueue) return; 
    isProcessingQueue = true; 

    try {
        const token = await getToken();
        if (!token) return; 

        const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_queue?token=eq.${token}&status=eq.pending`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        if (!res.ok) throw new Error("Erro ao ler Supabase");
        
        const mensagens = await res.json();

        for (const msg of mensagens) {
            console.log(`⏳ [BACKGROUND] Processando mensagem ${msg.id}...`);
            await atualizarStatusBD(msg.id, 'processing');

            try {
                if (msg.file_url && msg.file_url !== "null" && msg.file_url.trim() !== "") {
                    // SE FOR ÁUDIO -> VAI PARA O MOTOR FFMPEG
                    if (msg.file_name && msg.file_name.startsWith('audio_')) {
                        const dlRes = await fetch(msg.file_url);
                        const audioBlob = await dlRes.blob();
                        
                        await guardarNoTemp(msg.id, audioBlob);
                        const conversionSuccess = await convertAudioWithTemp(msg.id);
                        
                        if (conversionSuccess) {
                            const convertedBlob = await lerDoTemp(msg.id);
                            const buffer = await convertedBlob.arrayBuffer();
                            msg.base64_file = `data:audio/ogg; codecs=opus;base64,${bufferToBase64(buffer)}`;
                            enviarParaWhatsApp(msg);
                            setTimeout(() => limparTemp(msg.id), 10000); // Agenda limpeza
                        } else {
                            throw new Error("Falha na conversão no Motor Offscreen");
                        }
                    } else {
                        // SE FOR OUTRO FICHEIRO -> ENVIA DIRETO
                        const dlRes = await fetch(msg.file_url);
                        const arrayBuffer = await dlRes.arrayBuffer();
                        const mimeType = dlRes.headers.get('content-type') || 'application/octet-stream';
                        msg.base64_file = `data:${mimeType};base64,${bufferToBase64(arrayBuffer)}`;
                        msg.mime_type = mimeType;
                        enviarParaWhatsApp(msg);
                    }
                } else {
                    enviarParaWhatsApp(msg);
                }
            } catch (innerError) {
                console.error(`❌ Erro no item ${msg.id}:`, innerError);
                await atualizarStatusBD(msg.id, 'error');
            }
        }
    } catch (e) {
        console.error("❌ Erro geral na fila:", e);
    } finally {
        isProcessingQueue = false; 
    }
}

function enviarParaWhatsApp(msg) {
    chrome.tabs.query({ url: "*://web.whatsapp.com/*" }, (tabs) => {
        if (tabs.length > 0) { 
            chrome.tabs.sendMessage(tabs[0].id, { action: "FORWARD_TO_INJECTED", payload: msg })
                .then(() => console.log(`✅ [BACKGROUND] Mensagem ${msg.id} entregue à aba.`))
                .catch((err) => {
                    console.error("❌ [BACKGROUND] Erro de envio à aba:", err.message);
                    atualizarStatusBD(msg.id, 'pending'); 
                });
        } else { 
            console.error("❌ [BACKGROUND] WhatsApp Web não aberto.");
            atualizarStatusBD(msg.id, 'pending'); 
        }
    });
}

setInterval(verificarCaixaDeCorreio, 3000);

// --- OUVINTES (RÁDIO E UPLOAD) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Escuta o Rádio do Offscreen
    if (request.action === 'RADIO_OFFSCREEN') {
        console.log(`📻 [DIRETO DO OFFSCREEN]: ${request.texto}`);
        return true;
    }

    if (request.action === "UPLOAD_RAW_MEDIA") {
        uploadToSupabase(request.base64, request.mimeType, request.fileName, request.messageId)
            .then(url => sendResponse({ success: true, url: url }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; 
    }
});

async function uploadToSupabase(base64Data, mimeType, fileName, messageId) {
    const idSanitized = messageId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const finalName = fileName ? `${idSanitized}_${fileName}` : `${idSanitized}.bin`;
    const base64String = base64Data.split(',')[1];
    const byteCharacters = atob(base64String);
    const byteArray = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) { byteArray[i] = byteCharacters.charCodeAt(i); }
    const blob = new Blob([byteArray], { type: mimeType });

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/whatsapp_media/${finalName}`;
    const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': mimeType }, body: blob });
    if (!res.ok) throw new Error(await res.text());
    return `${SUPABASE_URL}/storage/v1/object/public/whatsapp_media/${finalName}`;
}