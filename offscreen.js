// offscreen.js - Versão FINAL com Filtro de Sucesso (exit 0)

// 1. Rádio Transmissor
function relatar(msg) {
    chrome.runtime.sendMessage({ action: 'RADIO_OFFSCREEN', texto: msg }).catch(() => {});
}

// 2. Detetives de Erros
window.onerror = function(msg) { relatar(`🚨 ERRO DE SINTAXE: ${msg}`); };
window.addEventListener('unhandledrejection', function(e) { relatar(`🚨 REJEIÇÃO: ${e.reason}`); });

// 3. Ouvinte de Mensagens
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'CONVERT_AUDIO_TEMP') {
        executarFluxo(request.id).then(sendResponse);
        return true; 
    }
});

let coreInstance = null;

// 4. Carregador do Núcleo
function carregarCoreJS() {
    return new Promise((resolve, reject) => {
        if (typeof createFFmpegCore !== 'undefined') return resolve();
        relatar("A injetar ficheiro físico ffmpeg-core.js na página...");
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('ffmpeg/ffmpeg-core.js');
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Ficheiro ffmpeg-core.js não encontrado."));
        document.head.appendChild(script);
    });
}

// 5. Fluxo de Conversão
async function executarFluxo(id) {
    try {
        relatar(`Iniciando fluxo para ID: ${id}`);
        await carregarCoreJS();
        
        if (!coreInstance) {
            relatar("Inicializando Núcleo C++...");
            coreInstance = await createFFmpegCore({
                locateFile: (path, prefix) => {
                    if (path.endsWith('.wasm')) return chrome.runtime.getURL('ffmpeg/ffmpeg-core.wasm');
                    return prefix + path;
                },
                print: (msg) => relatar(`MOTOR: ${msg}`),
                printErr: (msg) => relatar(`MOTOR (Aviso/Info): ${msg}`)
            });
        }

        const core = coreInstance;
        const blobOriginal = await lerDoTemp(id);
        if (!blobOriginal) throw new Error("Ficheiro Temp não encontrado.");
        
        const arrayBuffer = await blobOriginal.arrayBuffer();
        core.FS.writeFile('input.audio', new Uint8Array(arrayBuffer));

        relatar("A processar áudio na linha principal...");
        
        // --- FILTRO DE SUCESSO BLINDADO ---
        try {
            executeFFmpeg(core, ['-nostdin', '-y', '-i', 'input.audio', '-c:a', 'libopus', '-b:a', '16k', '-ac', '1', '-ar', '16000', '-f', 'ogg', 'output.ogg']);
        } catch (status) {
            // O FFmpeg v11-st dispara um erro ao finalizar com sucesso (exit 0)
            const erroTxt = status.message || String(status);
            if (erroTxt.includes("exit(0)") || erroTxt.includes("FFMPEG_END")) {
                relatar("Motor finalizou com sucesso (Sinal de saída 0).");
            } else {
                throw status; // Se for erro de verdade, explode aqui
            }
        }

        relatar("Processamento concluído! A ler ficheiro resultante...");
        const outputData = core.FS.readFile('output.ogg'); 
        const finalBlob = new Blob([outputData.buffer], { type: 'audio/ogg; codecs=opus' });
        
        await guardarNoTemp(id, finalBlob);
        core.FS.unlink('input.audio');
        core.FS.unlink('output.ogg');

        relatar("✅ Sucesso Absoluto!");
        return { success: true };
    } catch (error) {
        relatar(`❌ ERRO FATAL: ${error.message || String(error)}`);
        return { success: false, error: error.message || String(error) };
    }
}

// 6. Ponte C++
function executeFFmpeg(core, args) {
    const commandArgs = ['ffmpeg', ...args];
    const pointers = commandArgs.map((arg) => {
        const length = core.lengthBytesUTF8(arg) + 1;
        const pointer = core._malloc(length);
        core.stringToUTF8(arg, pointer, length);
        return pointer;
    });
    
    const argvPointer = core._malloc(pointers.length * 4);
    pointers.forEach((ptr, i) => core.setValue(argvPointer + (i * 4), ptr, 'i32'));

    const result = core.ccall('main', 'number', ['number', 'number'], [pointers.length, argvPointer]);

    pointers.forEach(ptr => core._free(ptr));
    core._free(argvPointer);
    return result;
}