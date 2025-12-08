import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'database', 'mangas.json');

export interface MangaEntry {
    titulo: string;
    urlBase: string;
    lastChapter: number;
    channelId: string;
    mensagemPadrao?: string;
    imagem?: string;
    urlMangapark?: string;
    urlMangataro?: string;
}

function ensureDirectory() {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

export function getMangas(): MangaEntry[] {
    ensureDirectory();
    if (!fs.existsSync(filePath)) return [];
    
    try {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error("❌ Erro ao ler banco de dados:", e);
        return [];
    }
}

export function loadState(): void {
    ensureDirectory(); // Garante que a pasta 'database' existe
    
    if (!fs.existsSync(filePath)) {
        // Se o arquivo não existe, cria um array vazio
        fs.writeFileSync(filePath, JSON.stringify([], null, 2));
        console.log("[State] Banco de dados criado com sucesso (vazio).");
    } else {
        // Se já existe, só avisa que encontrou
        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            const json = JSON.parse(data);
            console.log(`[State] Banco de dados carregado. Total de obras: ${json.length}`);
        } catch (e) {
            console.error("[State] O arquivo existe mas está corrompido. Tente corrigir manualmente.");
        }
    }
}

export function addManga(newManga: MangaEntry): void {
    const mangas = getMangas();
    
    // Procura pelo TÍTULO (que é único e fixo), ignorando maiúsculas/minúsculas
    const index = mangas.findIndex(m => m.titulo.toLowerCase() === newManga.titulo.toLowerCase());

    if (index !== -1) {
        // Atualiza a entrada existente
        mangas[index] = newManga;
        console.log(`[State] Atualizando obra existente: ${newManga.titulo}`);
    } else {
        // Adiciona nova
        mangas.push(newManga);
        console.log(`[State] Cadastrando nova obra: ${newManga.titulo}`);
    }

    // Salva no arquivo
    try {
        fs.writeFileSync(filePath, JSON.stringify(mangas, null, 2));
    } catch (error) {
        console.error("❌ [State] ERRO CRÍTICO AO SALVAR JSON:", error);
    }
}

export function removeManga(tituloParaRemover: string): boolean {
    const mangas = getMangas();
    const quantidadeInicial = mangas.length;

    // Filtra removendo apenas se o TÍTULO bater
    const novaLista = mangas.filter(m => m.titulo.toLowerCase() !== tituloParaRemover.toLowerCase());

    if (novaLista.length < quantidadeInicial) {
        fs.writeFileSync(filePath, JSON.stringify(novaLista, null, 2));
        console.log(`🗑️ [State] Obra removida: ${tituloParaRemover}`);
        return true; // Sucesso!
    }

    return false; // Não achou nada
}

export function limparDuplicatas(): void {
    const mangas = getMangas();
    const unicos = new Map();

    // Mantém apenas a versão mais recente de cada título
    mangas.forEach(m => {
        const existente = unicos.get(m.titulo.toLowerCase());
        if (!existente || m.lastChapter > existente.lastChapter) {
            unicos.set(m.titulo.toLowerCase(), m);
        }
    });

    const listaLimpa = Array.from(unicos.values());
    fs.writeFileSync(filePath, JSON.stringify(listaLimpa, null, 2));
}