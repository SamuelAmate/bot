import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191';
const FLARESOLVERR_API = `${BASE_URL.replace(/\/$/, '')}/v1`;

export async function wakeUpRender(): Promise<void> {
    console.log(" [System] Verificando conexão com FlareSolverr em: " + FLARESOLVERR_API);
    try {
        const res = await axios.post(FLARESOLVERR_API, { 
            cmd: 'sessions.list',
            maxTimeout: 10000 
        });
        if (res.data.status === 'ok') console.log("[System] Flaresolverr está online e pronto!");
    } catch (error) {
        console.error("[System] Falha ao conectar no Flaresolverr.");
    }
}

// --- LÓGICA DE CAPÍTULOS DECIMAIS ---
function gerarCandidatos(capituloAtual: number): number[] {
    const candidatos: number[] = [];
    
    // Arredonda para evitar erros de ponto flutuante (ex: 8.1 + 0.1 = 8.2000004)
    const fix = (n: number) => parseFloat(n.toFixed(1));

    // 1. Tenta o próximo decimal direto (.1)
    candidatos.push(fix(capituloAtual + 0.1));

    // 2. Tenta o .5 (se já não tiver passado dele ou se não for o passo anterior)
    const proximoMeio = Math.floor(capituloAtual) + 0.5;
    if (proximoMeio > capituloAtual) {
        candidatos.push(proximoMeio);
    }

    // 3. Tenta o próximo inteiro
    candidatos.push(Math.floor(capituloAtual) + 1);

    // Remove duplicatas e ordena (ex: se estiver no 8.4, o +0.1 é 8.5, que é igual ao proximoMeio)
    return [...new Set(candidatos)].sort((a, b) => a - b);
}

// --- FUNÇÃO 1: O VIGIA (Sakura) ---
export async function verificarSeSaiuNoSakura(urlBaseSakura: string, ultimoCapitulo: number): Promise<{ saiu: boolean, numero: number, novaUrl: string }> {
    
    // Gera lista de possibilidades: ex: 8 -> [8.1, 8.5, 9] | 8.2 -> [8.3, 8.5, 9]
    const listaDeTestes = gerarCandidatos(ultimoCapitulo);
    const sessionID = `sakura_${Date.now()}`;

    try {
        // Itera sobre os candidatos em ordem. O primeiro que achar, retorna.
        for (const proximoNumero of listaDeTestes) {
            
            // FORMATAÇÃO DE URL: Sakura usa traço para decimais (ex: 69.1 -> 69-1)
            // Se for inteiro (69), fica 69.
            const numeroFormatadoURL = proximoNumero.toString().replace('.', '-');

            // Monta a URL removendo o número antigo e pondo o novo
            // O regex busca o último segmento numérico (com ou sem traços)
            let urlParaTestar = "";
            const match = urlBaseSakura.match(/(\d+(?:[-]\d+)?)\/?$/);
            
            if (match) {
                // Substitui "69-1" ou "69" pelo novo número formatado
                urlParaTestar = urlBaseSakura.replace(match[1], numeroFormatadoURL);
            } else {
                // Fallback: adiciona no final
                urlParaTestar = `${urlBaseSakura.replace(/\/+$/, "")}/${numeroFormatadoURL}/`;
            }

            // Otimização: Log simples
            // console.log(`[Sakura] Testando Cap ${proximoNumero} (URL: ...${urlParaTestar.slice(-10)})`);

            const html = await requestFlaresolverr(urlParaTestar, sessionID);

            if (html) {
                const $ = cheerio.load(html);
                const title = $('title').text().trim();

                // Regex flexível: aceita "Capítulo 69.1", "Cap 69-1", "69.1", etc.
                // Escapamos o ponto para o regex entender que é literal
                const numRegex = proximoNumero.toString().replace('.', '[.,-]');
                const regexTitle = new RegExp(`(?:Cap|Capítulo|Ch|Chapter).*?${numRegex}`, 'i');

                // Verificação extra: O título deve conter o número, E não ser página de erro 404 genérica
                if (regexTitle.test(title) && !title.includes("Página não encontrada")) {
                    return { saiu: true, numero: proximoNumero, novaUrl: urlParaTestar };
                }
            }
            // Se não achou este candidato, o loop continua para o próximo (ex: testou 8.1, falhou -> testa 8.5...)
        }

    } catch (e) {
        console.error(`[Sakura] Erro ao verificar: ${e}`);
    } finally {
        destroySession(sessionID);
    }

    return { saiu: false, numero: ultimoCapitulo, novaUrl: urlBaseSakura };
}

// --- FUNÇÃO 2: O BUSCADOR (MangaPark / Genérico) ---
export async function buscarLinkNaObra(urlPaginaObra: string, capituloAlvo: number): Promise<{ link: string, titulo: string | null }> {
    const sessionID = `busca_mp_${Date.now()}`;

    try {
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

            // Regex para achar "Chapter 8.5" ou "Ch. 8.5"
            // O replace garante que 8.5 seja lido no regex como 8\.5
            const numString = capituloAlvo.toString().replace('.', '\\.');
            const regexCapitulo = new RegExp(`(?:^|\\s|ch\\.?|chapter)\\s*${numString}(?:\\s|:|$)`, 'i');

            if (regexCapitulo.test(textoLink)) {
                if (href.startsWith('http')) {
                    linkEncontrado = href;
                } else {
                    const urlBase = new URL(urlPaginaObra).origin;
                    linkEncontrado = urlBase + href;
                }

                // Tenta pegar o título (lógica visual do site)
                let rawText = $(el).find('span.opacity-50').text().trim(); // MangaPark novo
                if (!rawText) rawText = $(el).text().replace(regexCapitulo, '').trim();
                
                const tituloLimpo = rawText.replace(/^[:\s\-"\.]+/, '').replace(/["-]+$/, '').trim();
                if (tituloLimpo.length > 2) tituloEncontrado = tituloLimpo;

                return false; 
            }
        });

        if (linkEncontrado) {
            return { link: linkEncontrado, titulo: tituloEncontrado };
        } else {
            return { link: urlPaginaObra, titulo: null };
        }

    } catch (error) {
        console.error("Erro na busca MangaPark:", error);
        return { link: urlPaginaObra, titulo: null };
    } finally {
        destroySession(sessionID);
    }
}

// Helpers
async function requestFlaresolverr(url: string, session: string) {
    try {
        const res = await axios.post(FLARESOLVERR_API, {
            cmd: 'request.get', url, maxTimeout: 60000, session 
        });
        if (res.data.status === 'ok') return res.data.solution.response;
    } catch (e) { return null; }
    return null;
}

async function destroySession(session: string) {
    axios.post(FLARESOLVERR_API, { cmd: 'sessions.destroy', session }).catch(() => {});
}