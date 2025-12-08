import axios from 'axios';
import * as cheerio from 'cheerio';

// Pega a URL do ambiente ou usa o padrão. 
// O replace remove a barra no final se houver, e adiciona /v1
const BASE_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191';
const FLARESOLVERR_API = `${BASE_URL.replace(/\/$/, '')}/v1`;

// --- NOVA FUNÇÃO: WAKE UP ---
export async function wakeUpRender(): Promise<void> {
    console.log(" [System] Verificando conexão com FlareSolverr em: " + FLARESOLVERR_API);
    try {
        const res = await axios.post(FLARESOLVERR_API, { 
            cmd: 'sessions.list',
            maxTimeout: 10000 
        });
        
        if (res.data.status === 'ok') {
            console.log("[System] Flaresolverr está online e pronto!");
        } else {
            console.warn("[System] Flaresolverr respondeu, mas com status estranho.");
        }
    } catch (error) {
        console.error("[System] Falha ao conectar no Flaresolverr. O scraper pode falhar.");
    }
}

// --- FUNÇÃO 1: O VIGIA (Sakura) ---
export async function verificarSeSaiuNoSakura(urlBaseSakura: string, ultimoCapitulo: number): Promise<{ saiu: boolean, numero: number, novaUrl: string }> {
    const proximoNumero = ultimoCapitulo + 1;
    
    // Tenta adivinhar a URL do próximo capítulo
    let urlParaTestar = "";
    const match = urlBaseSakura.match(/(\d+)\/?$/);
    if (match) {
        urlParaTestar = urlBaseSakura.replace(match[1], proximoNumero.toString());
    } else {
        urlParaTestar = `${urlBaseSakura.replace(/\/+$/, "")}/${proximoNumero}/`;
    }

    const sessionID = `sakura_${Date.now()}`;

    try {
        console.log(`[Sakura] Monitorando cap ${proximoNumero}...`);
        const html = await requestFlaresolverr(urlParaTestar, sessionID);
        
        if (!html) return { saiu: false, numero: ultimoCapitulo, novaUrl: urlBaseSakura };

        const $ = cheerio.load(html);
        const title = $('title').text().trim();

        const regex = new RegExp(`Cap(\\.|ítulo)?\\s*${proximoNumero}`, 'i');
        
        if (regex.test(title)) {
            return { saiu: true, numero: proximoNumero, novaUrl: urlParaTestar };
        }
    } catch (e) {
        // Erro silencioso
    } finally {
        destroySession(sessionID);
    }

    return { saiu: false, numero: ultimoCapitulo, novaUrl: urlBaseSakura };
}

// --- FUNÇÃO 2: O BUSCADOR (MangaPark / Genérico) ---
export async function buscarLinkNaObra(urlPaginaObra: string, capituloAlvo: number): Promise<{ link: string, titulo: string | null }> {
    const sessionID = `busca_mp_${Date.now()}`;

    try {
        console.log(`[MangaPark] Entrando na página da obra para achar o Cap ${capituloAlvo}...`);
        
        const html = await requestFlaresolverr(urlPaginaObra, sessionID);
        if (!html) return { link: urlPaginaObra, titulo: null };

        const $ = cheerio.load(html);
        let linkEncontrado = "";
        let tituloEncontrado: string | null = null;

        $('a').each((_, el) => {
            if (linkEncontrado) return false;

            const textoLink = $(el).text().trim().toLowerCase();
            const href = $(el).attr('href');

            if (!href) return;

            const regexCapitulo = new RegExp(`(?:^|\\s|ch\\.?|chapter)\\s*${capituloAlvo}(?:\\s|:|$)`, 'i');

            if (regexCapitulo.test(textoLink)) {
                // 1. Montagem do Link
                if (href.startsWith('http')) {
                    linkEncontrado = href;
                } else {
                    const urlBase = new URL(urlPaginaObra).origin;
                    linkEncontrado = urlBase + href;
                }

                // 2. Caça ao Título
                let rawText = $(el).find('span.opacity-50').text().trim();
                
                if (!rawText) {
                    rawText = $(el).text().replace(regexCapitulo, '').trim();
                }

                if (!rawText || rawText.length < 3) {
                    const vizinho = $(el).next('span');
                    if (vizinho.length > 0) {
                        rawText = vizinho.text().trim();
                    }
                }
                
                // 3. Limpeza
                const tituloLimpo = rawText
                    .replace(/^[:\s\-"\.]+/, '')
                    .replace(/["-]+$/, '')
                    .trim();

                if (tituloLimpo.length > 2) {
                    tituloEncontrado = tituloLimpo;
                }

                console.log(`[Debug] Título Bruto: "${rawText}" | Final: "${tituloEncontrado}"`);
                return false; 
            }
        });

        if (linkEncontrado) {
            console.log(`[MangaPark] Link: ${linkEncontrado} | Título: ${tituloEncontrado || "Sem título"}`);
            return { link: linkEncontrado, titulo: tituloEncontrado };
        } else {
            console.log(`[MangaPark] Link específico não achado.`);
            return { link: urlPaginaObra, titulo: null };
        }

    } catch (error) {
        console.error("Erro na busca MangaPark:", error);
        return { link: urlPaginaObra, titulo: null };
    } finally {
        destroySession(sessionID);
    }
}

// Helpers (FlareSolverr)
async function requestFlaresolverr(url: string, session: string) {
    try {
        // Agora usa a constante corrigida FLARESOLVERR_API
        const res = await axios.post(FLARESOLVERR_API, {
            cmd: 'request.get', url, maxTimeout: 60000, session // Aumentei timeout para 60s
        });
        if (res.data.status === 'ok') return res.data.solution.response;
    } catch (e) { return null; }
    return null;
}

async function destroySession(session: string) {
    axios.post(FLARESOLVERR_API, { cmd: 'sessions.destroy', session }).catch(() => {});
}