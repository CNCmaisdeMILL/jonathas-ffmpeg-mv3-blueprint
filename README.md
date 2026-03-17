\# 🚀 FFmpeg MV3: Direct Core Injection Template



Este repositório fornece um template 100% funcional para contornar as restrições de segurança (CSP) do Manifest V3 do Google Chrome ao executar processamento de áudio/vídeo local com FFmpeg WebAssembly.



\## ⚠️ O Problema que Resolvemos

Extensões MV3 bloqueiam a criação de Web Workers via `blob:` URLs, quebrando bibliotecas padrão como `@ffmpeg/ffmpeg`. Além disso, o uso de `postMessage` para transferir arquivos grandes entre a página de fundo e o `offscreen.html` causa travamentos de memória.



\## 💡 A Nossa Arquitetura

1\. \*\*Direct Core Injection:\*\* Descartamos os wrappers e invocamos o núcleo Single-Thread C++ (`ffmpeg-core.wasm`) diretamente no `offscreen.js` usando ponteiros de memória (`ccall`).

2\. \*\*IndexedDB as a Drive:\*\* Usamos o IndexedDB (`db-utility.js`) como um "disco rígido" virtual. O Service Worker salva o arquivo, e o Offscreen Document apenas lê a memória local, convertendo arquivos gigantes sem gargalos de RAM.

3\. \*\*Exit(0) Crash Fix:\*\* Tratamento específico para evitar que o sinal de sucesso do C++ seja interpretado como um erro fatal pelo navegador.



\## 🛠️ Como Testar

1\. Clone este repositório.

2\. Acesse `chrome://extensions/` no seu navegador Chrome.

3\. Ative o \*\*Modo do desenvolvedor\*\* no canto superior direito.

4\. Clique em \*\*Carregar sem compactação\*\* e selecione a pasta clonada.

5\. Inspecione o `background.js` e rode a sua função de teste para ver a conversão nativa acontecer em milissegundos!

