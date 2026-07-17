import { uploadPresigned } from "@vercel/blob/client";

const elements = {
    tabs: [...document.querySelectorAll("[data-tab]")],
    panels: {
        save: document.querySelector("#panel-save"),
        recover: document.querySelector("#panel-recover")
    },
    saveForm: document.querySelector("#save-form"),
    saveText: document.querySelector("#save-text"),
    saveButton: document.querySelector("#save-button"),
    saveNotice: document.querySelector("#save-notice"),
    textStats: document.querySelector("#text-stats"),
    unlockCard: document.querySelector("#unlock-card"),
    unlockForm: document.querySelector("#unlock-form"),
    password: document.querySelector("#recovery-password"),
    unlockButton: document.querySelector("#unlock-button"),
    recoverNotice: document.querySelector("#recover-notice"),
    recoveryToolbar: document.querySelector("#recovery-toolbar"),
    recoveryStatus: document.querySelector("#recovery-status"),
    reloadButton: document.querySelector("#reload-button"),
    entries: document.querySelector("#entries"),
    emptyState: document.querySelector("#empty-state")
};

const numberFormatter = new Intl.NumberFormat("es-PE");
const dateFormatter = new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short"
});

let recoveryToken = "";
let loadGeneration = 0;
let statsFrame = 0;

function activateTab(tabName){
    for(const tab of elements.tabs){
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
    }

    for(const [name, panel] of Object.entries(elements.panels)){
        panel.hidden = name !== tabName;
    }

    if(tabName === "recover" && !recoveryToken){
        window.setTimeout(() => elements.password.focus(), 0);
    }
}

function showNotice(element, message, type = "error"){
    element.textContent = message;
    element.className = `notice ${type}`;
    element.hidden = false;
}

function hideNotice(element){
    element.hidden = true;
    element.textContent = "";
    element.className = "notice";
}

function formatBytes(bytes){
    if(bytes < 1024){
        return `${bytes} B`;
    }

    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = -1;

    do{
        value /= 1024;
        unit += 1;
    }while(value >= 1024 && unit < units.length - 1);

    const decimals = value >= 10 ? 1 : 2;
    return `${value.toFixed(decimals)} ${units[unit]}`;
}

function updateTextStats(){
    statsFrame = 0;
    const text = elements.saveText.value;
    const bytes = new Blob([text]).size;
    elements.textStats.textContent = `${numberFormatter.format(text.length)} caracteres · ${formatBytes(bytes)}`;
}

function scheduleTextStats(){
    if(statsFrame){
        cancelAnimationFrame(statsFrame);
    }

    statsFrame = requestAnimationFrame(updateTextStats);
}

function createId(){
    if(typeof crypto.randomUUID === "function"){
        return crypto.randomUUID();
    }

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function readJsonResponse(response){
    try{
        return await response.json();
    }catch{
        return {};
    }
}

async function saveText(event){
    event.preventDefault();
    hideNotice(elements.saveNotice);

    const text = elements.saveText.value;

    if(text.length === 0){
        showNotice(elements.saveNotice, "Pega algún texto antes de guardar.");
        elements.saveText.focus();
        return;
    }

    const originalButtonText = elements.saveButton.textContent;
    elements.saveButton.disabled = true;
    elements.saveButton.textContent = "Preparando…";

    try{
        const id = createId();
        const createdAt = new Date().toISOString();
        const payload = JSON.stringify({
            version: 1,
            id,
            createdAt,
            text
        });
        const file = new Blob([payload], {
            type: "application/json"
        });
        const timestamp = createdAt.replaceAll(":", "-");
        const pathname = `entries/${timestamp}_${id}.json`;

        await uploadPresigned(pathname, file, {
            access: "private",
            handleUploadUrl: "/api/upload",
            contentType: "application/json",
            multipart: file.size > (100 * 1024 * 1024),
            onUploadProgress: progress => {
                elements.saveButton.textContent = `Guardando ${Math.round(progress.percentage)}%`;
            }
        });

        elements.saveText.value = "";
        updateTextStats();
        showNotice(
            elements.saveNotice,
            "Texto guardado correctamente.",
            "success"
        );
        elements.saveText.focus();
    }catch(error){
        console.error(error);
        const message = error?.message?.includes("almacenamiento")
            ? error.message
            : "No se pudo guardar el texto. Revisa tu conexión e inténtalo otra vez.";
        showNotice(elements.saveNotice, message);
    }finally{
        elements.saveButton.disabled = false;
        elements.saveButton.textContent = originalButtonText;
    }
}

function setUnlockLoading(isLoading){
    elements.unlockButton.disabled = isLoading;
    elements.password.disabled = isLoading;
    elements.unlockButton.textContent = isLoading ? "Verificando…" : "Recuperar";
}

async function authenticateRecovery(event){
    event.preventDefault();
    hideNotice(elements.recoverNotice);
    setUnlockLoading(true);

    try{
        const response = await fetch("/api/recover", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                password: elements.password.value
            })
        });
        const data = await readJsonResponse(response);

        if(!response.ok || !data.token){
            throw new Error(data.error || "No se pudo verificar la contraseña.");
        }

        recoveryToken = data.token;
        elements.password.value = "";
        elements.unlockCard.hidden = true;
        elements.recoveryToolbar.hidden = false;
        await loadAllEntries();
    }catch(error){
        showNotice(
            elements.recoverNotice,
            error?.message || "No se pudo verificar la contraseña."
        );
        elements.password.select();
    }finally{
        setUnlockLoading(false);
    }
}

function resetRecovery(message){
    recoveryToken = "";
    loadGeneration += 1;
    elements.unlockCard.hidden = false;
    elements.recoveryToolbar.hidden = true;
    elements.entries.replaceChildren();
    elements.emptyState.hidden = true;
    elements.recoveryStatus.textContent = "";

    if(message){
        showNotice(elements.recoverNotice, message);
    }

    elements.password.focus();
}

async function getEntryPages(generation){
    const allEntries = [];
    let cursor = "";
    let hasMore = true;

    while(hasMore){
        if(generation !== loadGeneration){
            return [];
        }

        const url = new URL("/api/recover", window.location.origin);

        if(cursor){
            url.searchParams.set("cursor", cursor);
        }

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${recoveryToken}`
            },
            cache: "no-store"
        });
        const data = await readJsonResponse(response);

        if(response.status === 401){
            throw new Error(data.error || "La sesión de recuperación expiró.");
        }

        if(!response.ok || !Array.isArray(data.entries)){
            throw new Error(data.error || "No se pudo obtener la lista de textos.");
        }

        allEntries.push(...data.entries);
        elements.recoveryStatus.textContent = `Encontrados: ${numberFormatter.format(allEntries.length)}…`;

        hasMore = Boolean(data.hasMore);
        cursor = typeof data.cursor === "string" ? data.cursor : "";

        if(hasMore && !cursor){
            throw new Error("La lista de textos quedó incompleta. Inténtalo nuevamente.");
        }
    }

    return allEntries.sort((first, second) => {
        return new Date(second.uploadedAt).getTime() - new Date(first.uploadedAt).getTime();
    });
}

function createEntryCard(metadata, index){
    const card = document.createElement("article");
    card.className = "entry-card";

    const header = document.createElement("header");
    header.className = "entry-header";

    const meta = document.createElement("div");
    meta.className = "entry-meta";

    const title = document.createElement("span");
    title.className = "entry-title";
    title.textContent = `Guardado ${index + 1}`;

    const detail = document.createElement("span");
    detail.className = "entry-detail";
    detail.textContent = `${dateFormatter.format(new Date(metadata.uploadedAt))} · ${formatBytes(metadata.size)}`;

    const copyButton = document.createElement("button");
    copyButton.className = "copy-button";
    copyButton.type = "button";
    copyButton.textContent = "Copiar";
    copyButton.disabled = true;

    const text = document.createElement("pre");
    text.className = "entry-text";
    text.textContent = "Recuperando contenido…";

    meta.append(title, detail);
    header.append(meta, copyButton);
    card.append(header, text);

    copyButton.addEventListener("click", async () => {
        try{
            await copyText(text.textContent);
            copyButton.textContent = "Copiado";
            copyButton.classList.add("copied");
            window.setTimeout(() => {
                copyButton.textContent = "Copiar";
                copyButton.classList.remove("copied");
            }, 1600);
        }catch{
            copyButton.textContent = "Error";
            window.setTimeout(() => {
                copyButton.textContent = "Copiar";
            }, 1600);
        }
    });

    return {
        card,
        copyButton,
        detail,
        text
    };
}

async function copyText(text){
    if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(text);
        return;
    }

    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.setAttribute("readonly", "");
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.append(fallback);
    fallback.select();
    const copied = document.execCommand("copy");
    fallback.remove();

    if(!copied){
        throw new Error("No se pudo copiar.");
    }
}

async function fetchEntry(url, attempts = 3){
    let lastError;

    for(let attempt = 1; attempt <= attempts; attempt += 1){
        try{
            const response = await fetch(url, {
                cache: "no-store"
            });

            if(!response.ok){
                throw new Error(`Respuesta ${response.status}`);
            }

            const data = await response.json();

            if(typeof data?.text !== "string"){
                throw new Error("Formato de texto no válido.");
            }

            return data;
        }catch(error){
            lastError = error;

            if(attempt < attempts){
                await new Promise(resolve => window.setTimeout(resolve, attempt * 350));
            }
        }
    }

    throw lastError;
}

async function runWithConcurrency(items, concurrency, worker){
    let nextIndex = 0;

    async function run(){
        while(nextIndex < items.length){
            const currentIndex = nextIndex;
            nextIndex += 1;
            await worker(items[currentIndex], currentIndex);
        }
    }

    const runners = Array.from(
        { length: Math.min(concurrency, items.length) },
        () => run()
    );

    await Promise.all(runners);
}

async function loadAllEntries(){
    const generation = ++loadGeneration;
    hideNotice(elements.recoverNotice);
    elements.reloadButton.disabled = true;
    elements.entries.replaceChildren();
    elements.emptyState.hidden = true;
    elements.recoveryStatus.textContent = "Buscando todos los textos guardados…";

    try{
        const metadata = await getEntryPages(generation);

        if(generation !== loadGeneration){
            return;
        }

        if(metadata.length === 0){
            elements.recoveryStatus.textContent = "0 textos guardados";
            elements.emptyState.hidden = false;
            return;
        }

        const cards = metadata.map((entry, index) => {
            const card = createEntryCard(entry, index);
            elements.entries.append(card.card);
            return card;
        });
        let completed = 0;
        let failures = 0;

        await runWithConcurrency(metadata, 5, async (entry, index) => {
            if(generation !== loadGeneration){
                return;
            }

            const card = cards[index];

            try{
                const data = await fetchEntry(entry.url);

                if(generation !== loadGeneration){
                    return;
                }

                card.text.textContent = data.text;
                card.copyButton.disabled = false;

                if(data.createdAt){
                    const createdAt = new Date(data.createdAt);

                    if(!Number.isNaN(createdAt.getTime())){
                        card.detail.textContent = `${dateFormatter.format(createdAt)} · ${formatBytes(entry.size)}`;
                    }
                }
            }catch(error){
                console.error("No se pudo cargar un texto:", error);
                failures += 1;
                card.card.classList.add("has-error");
                card.text.textContent = "Este elemento no pudo cargarse. Pulsa Actualizar para reintentar.";
            }finally{
                completed += 1;
                elements.recoveryStatus.textContent = `Recuperando ${numberFormatter.format(completed)} de ${numberFormatter.format(metadata.length)}…`;
            }
        });

        if(generation !== loadGeneration){
            return;
        }

        elements.recoveryStatus.textContent = failures === 0
            ? `${numberFormatter.format(metadata.length)} textos recuperados`
            : `${numberFormatter.format(metadata.length - failures)} de ${numberFormatter.format(metadata.length)} textos recuperados`;

        if(failures > 0){
            showNotice(
                elements.recoverNotice,
                `${failures} elemento${failures === 1 ? "" : "s"} no pudo${failures === 1 ? "" : "ieron"} cargarse. Pulsa Actualizar para reintentar.`
            );
        }
    }catch(error){
        const message = error?.message || "No se pudieron recuperar los textos.";

        if(message.toLowerCase().includes("sesión")){
            resetRecovery(message);
            return;
        }

        showNotice(elements.recoverNotice, message);
        elements.recoveryStatus.textContent = "No se pudo completar la recuperación.";
    }finally{
        if(generation === loadGeneration){
            elements.reloadButton.disabled = false;
        }
    }
}

for(const tab of elements.tabs){
    tab.addEventListener("click", () => activateTab(tab.dataset.tab));
}

elements.saveForm.addEventListener("submit", saveText);
elements.saveText.addEventListener("input", scheduleTextStats);
elements.unlockForm.addEventListener("submit", authenticateRecovery);
elements.reloadButton.addEventListener("click", loadAllEntries);

updateTextStats();
