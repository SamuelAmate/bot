import * as fs from 'fs';
import * as path from 'path';

// Define a estrutura do objeto que será salvo para cada mangá
export interface MangaEntry {
    urlBase: string;       // Ex: https://sakuramangas.org/obras/witchriv/
    lastChapter: number;   // Último capítulo encontrado (ex: 7)
    channelId: string;     // Canal para notificar
    titulo: string;        // Título da obra
    mensagemPadrao: string; // Mensagem para notificação
}

const STATE_FILE = path.resolve(process.cwd(), 'estado.json');
// Usa um Map para facilitar a busca e evitar duplicidade de URL Base
let state = new Map<string, MangaEntry>(); 

// Carrega o estado do arquivo
export function loadState(): void {
    if (fs.existsSync(STATE_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            // Converte o objeto JSON de volta para Map
            state = new Map(Object.entries(data)); 
            console.log('Estado carregado com sucesso.');
        } catch (error) {
            console.error('Erro ao carregar o estado:', error);
        }
    }
}

export function removeManga(urlBase: string): boolean {
    const wasDeleted = state.delete(urlBase);
    if (wasDeleted) {
        saveState();
    }
    return wasDeleted;
}

// Salva o estado no arquivo
export function saveState(): void {
    try {
        // Converte o Map para um objeto para salvar no JSON
        const dataToSave = Object.fromEntries(state);
        fs.writeFileSync(STATE_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (error) {
        console.error('Erro ao salvar o estado:', error);
    }
}

export function addManga(entry: MangaEntry): void {
    // A chave do Map será a urlBase para garantir que não há duplicidade
    state.set(entry.urlBase, entry);
    saveState();
}

export function getMangas(): MangaEntry[] {
    return Array.from(state.values());
}