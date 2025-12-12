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
        if (res.data.status === 'ok') {
            console.log("[System] Flaresolverr está online e pronto!");
        }
    } catch (error) {
        console.error("[System] Falha ao conectar no Flaresolverr.");
    }
}

function gerarUrlEspelho(url: string): string | null {
    if (url.includes('mangapark.io')) return url.replace('mangapark.io', 'mangapark.net');
    if (url.includes('mangapark.net')) return url.replace('mangapark.net', 'mangapark.io');
    return null; // Não é mangapark ou formato desconhecido
}

// --- LÓGICA DE CAPÍTULOS (Decimais + Inteiros) ---
function gerarCandidatos(capituloAtual: number): number[] {
    const candidatos: number[] = [];
    const fix = (n: number) => parseFloat(n.toFixed(1));
    const baseInteira = Math.floor(capituloAtual);

    // 1. O próximo decimal (69.1 -> 69.2)
    candidatos.push(fix(capituloAtual + 0.1));
    
    // 2. O meio (69.5) - só se ainda não passou
    const atualMeio = baseInteira + 0.5;
    if (atualMeio > capituloAtual) candidatos.push(atualMeio);

    // 3. O próximo inteiro (70)
    const proximoInteiro = baseInteira + 1;
    candidatos.push(proximoInteiro);

    // 4. O decimal do próximo inteiro (70.1)
    candidatos.push(fix(proximoInteiro + 0.1));

    return [...new Set(candidatos)].sort((a, b) => a - b);
}

// --- FUNÇÃO 1: O VIGIA (Sakura) ---
export async function verificarSeSaiuNoSakura(urlBaseSakura: string, ultimoCapitulo: number): Promise<{ saiu: boolean, numero: number, novaUrl: string }> {
    const listaDeTestes = gerarCandidatos(ultimoCapitulo);
    const sessionID = `sakura_${Date.now()}`;

    try {
        for (const proximoNumero of listaDeTestes) {
            // Sakura usa traço para decimais na URL (ex: 69-1)
            const numeroFormatadoURL = proximoNumero.toString().replace('.', '-');
            
            let urlParaTestar = "";
            const match = urlBaseSakura.match(/(\d+(?:[-]\d+)?)\/?$/);
            
            if (match) {
                urlParaTestar = urlBaseSakura.replace(match[1], numeroFormatadoURL);
            } else {
                urlParaTestar = `${urlBaseSakura.replace(/\/+$/, "")}/${numeroFormatadoURL}/`;
            }

            console.log(`[Sakura] Testando Cap ${proximoNumero} em: ${urlParaTestar}`);

            const html = await requestFlaresolverr(urlParaTestar, sessionID);

            if (html) {
                const $ = cheerio.load(html);
                const title = $('title').text().trim();
                
                // Regex flexível no título da página
                const numRegex = proximoNumero.toString().replace('.', '[.,-]');
                const regexTitle = new RegExp(`(?:Cap|Capítulo|Ch|Chapter).*?${numRegex}`, 'i');

                if (regexTitle.test(title) && !title.includes("Página não encontrada")) {
                    console.log(`[Sakura] ✅ Encontrado: Cap ${proximoNumero}!`);
                    return { saiu: true, numero: proximoNumero, novaUrl: urlParaTestar };
                }
            }
        }
    } catch (e) {
        console.error(`[Sakura] Erro: ${e}`);
    } finally {
        destroySession(sessionID);
    }

    return { saiu: false, numero: ultimoCapitulo, novaUrl: urlBaseSakura };
}

export async function verificarSeSaiuNoMangaPark(urlMangaPark: string, ultimoCapitulo: number): Promise<{ saiu: boolean, numero: number, link: string, titulo: string | null }> {
    if (!urlMangaPark) return { saiu: false, numero: ultimoCapitulo, link: "", titulo: null };

    const listaDeTestes = gerarCandidatos(ultimoCapitulo);
    const sessionID = `mp_scan_${Date.now()}`;

    try {
        console.log(`[MangaPark] Acessando original: ${urlMangaPark} (Busca: ${listaDeTestes.join(', ')})`);
        // --- TENTATIVA 1: URL ORIGINAL ---
        let html = await requestFlaresolverr(urlMangaPark, sessionID);
        
        if (html) {
            for (const proximoNumero of listaDeTestes) {
                const resultado = analisarHtmlMangaPark(html, urlMangaPark, proximoNumero);
                if (resultado.encontrou) {
                    console.log(`[MangaPark] Encontrado: Cap ${proximoNumero} (Link: ${resultado.link})`);
                    return { saiu: true, numero: proximoNumero, link: resultado.link, titulo: resultado.titulo };
                }
            }
        }

        // --- TENTATIVA 2: URL ESPELHO (Fallback) ---
        // Se chegou aqui, não achou na original. Vamos tentar trocar .io por .net (ou vice-versa)
        const urlEspelho = gerarUrlEspelho(urlMangaPark);
        
        if (urlEspelho && urlEspelho !== urlMangaPark) {
            // console.log(`[MangaPark] Tentando mirror: ${urlEspelho}`);
            html = await requestFlaresolverr(urlEspelho, sessionID);

            if (html) {
                for (const proximoNumero of listaDeTestes) {
                    const resultado = analisarHtmlMangaPark(html, urlEspelho, proximoNumero);
                    if (resultado.encontrou) {
                        console.log(`[MangaPark] Encontrado no espelho (.net/.io)!`);
                        return { saiu: true, numero: proximoNumero, link: resultado.link, titulo: resultado.titulo };
                    }
                }
            } else {
                console.log(`[MangaPark] ❌ Falha ao carregar original (HTML vazio ou erro).`);
            }
        }

    } catch(e) {
        console.error(`[MangaPark Scan] Erro: ${e}`);
    } finally {
        destroySession(sessionID);
    }

    return { saiu: false, numero: ultimoCapitulo, link: "", titulo: null };
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

            // --- REGEX HÍBRIDO ---
            // Aceita decimais (ponto/traço) E estrutura de texto
            const numString = capituloAlvo.toString().replace('.', '[.,-]');
            const regexCapitulo = new RegExp(`(?:^|\\s|ch\\.?|chapter|vol\\.?\\s*\\d+)\\s*${numString}(?:\\s|:|$)`, 'i');

            if (regexCapitulo.test(textoLink)) {
                // 1. Salva o Link
                if (href.startsWith('http')) {
                    linkEncontrado = href;
                } else {
                    const urlBase = new URL(urlPaginaObra).origin;
                    linkEncontrado = urlBase + href;
                }

                // --- ESTRATÉGIA DE TÍTULO (Restaurada do código antigo) ---
                
                // Tática 1: Elementos internos específicos (MangaPark novo)
                let rawText = $(el).find('span.opacity-50').text().trim(); 
                
                // Tática 2: VIZINHO (Crucial - estava faltando)
                // Procura um <span> logo após o <a>
                if (!rawText) {
                    const vizinho = $(el).next('span');
                    if (vizinho.length > 0) {
                        rawText = vizinho.text().trim();
                    }
                }

                // Tática 3: Limpeza do próprio texto do link
                if (!rawText) {
                    // Remove "Chapter 69" do texto, sobrando o título
                    // RegexCaseInsensitive para replace
                    const regexReplace = new RegExp(`(?:^|\\s|ch\\.?|chapter|vol\\.?\\s*\\d+)\\s*${numString}(?:\\s|:|$)`, 'gi');
                    rawText = $(el).text().replace(regexReplace, '').trim();
                }

                // Limpeza final de pontuação
                const tituloLimpo = rawText
                    .replace(/^[:\s\-"\.]+|[:\s\-"\.]+$/g, '') 
                    .trim();

                // Validação para não pegar lixo como "NEW" ou datas
                if (tituloLimpo.length > 2 && !/^(new|up|hot|\d{1,2}\/\d{1,2})$/i.test(tituloLimpo)) {
                    tituloEncontrado = tituloLimpo;
                }
                
                return false; // Encontrou, para o loop
            }
        });

        if (linkEncontrado) {
            console.log(`[Scraper] Link: ${linkEncontrado} | Título: ${tituloEncontrado}`);
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

function analisarHtmlMangaPark(html: string, urlPaginaObra: string, capituloAlvo: number) {
    const $ = cheerio.load(html);
    let linkEncontrado = "";
    let tituloEncontrado: string | null = null;

    $('a').each((_, el) => {
        if (linkEncontrado) return false;

        const textoLink = $(el).text().trim().toLowerCase();
        const href = $(el).attr('href');
        if (!href) return;

        const numString = capituloAlvo.toString().replace('.', '[.,-]');
        const regexCapitulo = new RegExp(`(?:^|\\s|ch\\.?|chapter|vol\\.?\\s*\\d+)\\s*${numString}(?:\\s|:|$)`, 'i');

        if (regexCapitulo.test(textoLink)) {
            if (href.startsWith('http')) {
                linkEncontrado = href;
            } else {
                const urlBase = new URL(urlPaginaObra).origin;
                linkEncontrado = urlBase + href;
            }

            let rawText = $(el).find('span.opacity-50').text().trim(); 
            if (!rawText) {
                const vizinho = $(el).next('span');
                if (vizinho.length > 0) rawText = vizinho.text().trim();
            }
            if (!rawText) {
                const regexReplace = new RegExp(`(?:^|\\s|ch\\.?|chapter|vol\\.?\\s*\\d+)\\s*${numString}(?:\\s|:|$)`, 'gi');
                rawText = $(el).text().replace(regexReplace, '').trim();
            }

            const tituloLimpo = rawText.replace(/^[:\s\-"\.]+|[:\s\-"\.]+$/g, '').trim();
            if (tituloLimpo.length > 2 && !/^(new|up|hot|\d{1,2}\/\d{1,2})$/i.test(tituloLimpo)) {
                tituloEncontrado = tituloLimpo;
            }
            
            return false;
        }
    });

    if (linkEncontrado) return { encontrou: true, link: linkEncontrado, titulo: tituloEncontrado };
    return { encontrou: false, link: urlPaginaObra, titulo: null };
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