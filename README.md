# 🚀 FFmpeg WebAssembly - Manifest V3 Direct Core Injector

**A implementação definitiva e à prova de falhas para rodar FFmpeg em Extensões Chrome (Manifest V3) usando Offscreen Documents, IndexedDB e Injeção Direta de Núcleo.**

---

## 🛑 O Problema (The "Wall")
Desenvolvedores de extensões enfrentam três bloqueios críticos ao tentar usar `ffmpeg.wasm` no Manifest V3:
1. **CSP & Workers:** O Chrome bloqueia a criação de Web Workers via `blob:`, inviabilizando o uso de bibliotecas de "wrapper" padrão.
2. **Gargalos de Memória:** Tentar passar arquivos grandes (Base64) via `chrome.runtime.sendMessage` estoura o limite de memória do Service Worker.
3. **Falsos Erros de Execução:** O sinal de encerramento do C++ (`exit(0)`) é interpretado pelo JavaScript como um erro fatal, interrompendo o fluxo apesar do sucesso na conversão.

## 💡 A Solução (The "Secret Sauce")
Este projeto apresenta a arquitetura **Direct Core Injection**, desenvolvida para ser leve, rápida e indestrutível:
* **Injeção Direta:** Ignoramos os wrappers pesados e falamos diretamente com o núcleo `@ffmpeg/core-st` (Single-Thread) via ponteiros de memória (`ccall` / `main`).
* **Disco Rígido Virtual (IndexedDB):** Usamos o IndexedDB como ponte de dados. O arquivo é salvo no banco local, o motor o lê, converte e salva o resultado. Isso elimina o tráfego de strings Base64 gigantescas.
* **Escudo de Saída (Exit 0):** Um tratamento de exceção cirúrgico que identifica o sucesso do motor nativo e garante a continuidade do processo.

---

## ✨ Funcionalidades (Features)
* ✅ **Bypass de CSP:** Funciona 100% local sem violar as políticas de segurança do Chrome.
* ✅ **Conversão Ultra Rápida:** Testado com áudios MP3 de 1MB convertidos para OGG/Opus em menos de **600ms**.
* ✅ **Interface de Arrastar e Soltar:** Popup incluso para conversão manual imediata.
* ✅ **Integração com Supabase:** Pronto para monitorar filas de mensagens e converter áudios automaticamente para o WhatsApp Web.
* ✅ **Zero Dependências Externas:** O motor roda inteiramente no processador do usuário.

---

## 🏗️ Arquitetura de Ficheiros

millow-ffmpeg-pro/
│
├── manifest.json         # Configurações, Permissões e CSP (WASM)
├── background.js         # Service Worker (Fila Supabase e Controle)
├── db-utility.js         # Driver IndexedDB (O "Disco Rígido" compartilhado)
│
├── popup.html            # Interface de Drag-and-Drop
├── popup.css             # Estilo da interface
├── popup.js              # Lógica da interface e gatilho de conversão
│
├── offscreen.html        # Página invisível (Host do motor C++)
├── offscreen.js          # Injetor Direct Core (Onde a mágica acontece)
│
├── ffmpeg/               # Binários Brutos (Single-Thread)
│   ├── ffmpeg-core.js    # O "Cérebro" do motor (v0.11.1)
│   └── ffmpeg-core.wasm  # O "Músculo" do motor (v0.11.1)
│
