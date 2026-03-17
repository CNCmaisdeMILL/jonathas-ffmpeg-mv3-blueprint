// db-utility.js - IndexedDB Wrapper para Blobs Grandes

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("millow_temp_db", 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("temp_files")) {
                db.createObjectStore("temp_files", { keyPath: "id" });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function guardarNoTemp(id, blob) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["temp_files"], "readwrite");
        const store = transaction.objectStore("temp_files");
        const request = store.put({ id: id, blob: blob, timestamp: Date.now() });

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

async function lerDoTemp(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["temp_files"], "readonly");
        const store = transaction.objectStore("temp_files");
        const request = store.get(id);

        request.onsuccess = () => {
            if (request.result) {
                resolve(request.result.blob);
            } else {
                resolve(null);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

async function limparTemp(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["temp_files"], "readwrite");
        const store = transaction.objectStore("temp_files");
        const request = store.delete(id);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}