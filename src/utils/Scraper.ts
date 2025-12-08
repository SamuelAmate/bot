import axios from 'axios';
import * as cheerio from 'cheerio';

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || 'http://152.67.33.245:8191/v1';

// --- NOVA FUNÇÃO: WAKE UP (Adicione isto ao seu arquivo) ---
export async function wakeUpRender(): Promise<void> {
    console.log(" [System] Verificando conexão com Flaresolverr...");
    try {
        // Envia um comando leve apenas para ver se o serviço responde
        const res = await axios.post(FLARESOLVERR_URL, { 
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
        // Não jogamos throw erro aqui para não derrubar o bot inteiro, apenas logamos.
    }
}

// --- FUNÇÃO 1: O VIGIA (Sakura) ---
// (Essa parte verifica se o número do capítulo mudou no título da página)
export async function verificarSeSaiuNoSakura(urlBaseSakura: string, ultimoCapitulo: number): Promise<{ saiu: boolean, numero: number, novaUrl: string }> {
    const proximoNumero = ultimoCapitulo + 1;
    
    // Tenta adivinhar a URL do próximo capítulo no Sakura
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

        // Regex para ver se "Capítulo X" está no título
        const regex = new RegExp(`Cap(\\.|ítulo)?\\s*${proximoNumero}`, 'i');
        
        if (regex.test(title)) {
            return { saiu: true, numero: proximoNumero, novaUrl: urlParaTestar };
        }
    } catch (e) {
        // Erro silencioso para não poluir o log
    } finally {
        destroySession(sessionID);
    }

    return { saiu: false, numero: ultimoCapitulo, novaUrl: urlBaseSakura };
}

// --- FUNÇÃO 2: O BUSCADOR (MangaPark / Genérico) ---
// (Essa parte entra na lista de capítulos e caça o link certo)
export async function buscarLinkNaObra(urlPaginaObra: string, capituloAlvo: number): Promise<{ link: string, titulo: string | null }> {
    const sessionID = `busca_mp_${Date.now()}`;

    try {
        console.log(`[MangaPark] Entrando na página da obra para achar o Cap ${capituloAlvo}...`);
        
        const html = await requestFlaresolverr(urlPaginaObra, sessionID);
        if (!html) return { link: urlPaginaObra, titulo: null };

        const $ = cheerio.load(html);
        let linkEncontrado = "";
        let tituloEncontrado: string | null = null;

        // Percorre TODOS os links da página
        $('a').each((_, el) => {
            if (linkEncontrado) return false; // Se já achou, para.

            const textoLink = $(el).text().trim().toLowerCase();
            const href = $(el).attr('href');

            if (!href) return;

            // Regex para validar se é o capítulo certo (Ex: "157", "Chapter 157")
            const regexCapitulo = new RegExp(`(?:^|\\s|ch\\.?|chapter)\\s*${capituloAlvo}(?:\\s|:|$)`, 'i');

            if (regexCapitulo.test(textoLink)) {
                // --- 1. MONTAGEM DO LINK ---
                if (href.startsWith('http')) {
                    linkEncontrado = href;
                } else {
                    const urlBase = new URL(urlPaginaObra).origin;
                    linkEncontrado = urlBase + href;
                }

                // --- 2. CAÇA AO TÍTULO (Estratégia Baseada nas Imagens) ---
                
                // TENTATIVA A: Procurar SPAN dentro do Link (Baseado na Imagem 1)
                // Onde o título geralmente fica num span com opacidade
                let rawText = $(el).find('span.opacity-50').text().trim();
                
                // Se não achou na classe específica, pega qualquer texto dentro do link que NÃO seja o numero
                if (!rawText) {
                    rawText = $(el).text().replace(regexCapitulo, '').trim();
                }

                // TENTATIVA B: Procurar SPAN vizinho (Baseado na Imagem 2)
                // Às vezes o título está num <span> logo após o <a>
                if (!rawText || rawText.length < 3) {
                    const vizinho = $(el).next('span'); // Pega o próximo elemento se for span
                    if (vizinho.length > 0) {
                        rawText = vizinho.text().trim();
                    }
                }
                
                // --- 3. LIMPEZA FINAL ---
                // Remove caracteres chatos do começo (: - " )
                const tituloLimpo = rawText
                    .replace(/^[:\s\-"\.]+/, '') // Remove do início
                    .replace(/["-]+$/, '')      // Remove do fim
                    .trim();

                // Validação final: só aceita se tiver pelo menos 2 letras (pra evitar "v1", "pt-br", etc)
                if (tituloLimpo.length > 2) {
                    tituloEncontrado = tituloLimpo;
                }

                console.log(`[Debug] Título Bruto: "${rawText}" | Final: "${tituloEncontrado}"`);
                return false; // Sai do loop
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
        const res = await axios.post(FLARESOLVERR_URL, {
            cmd: 'request.get', url, maxTimeout: 20000, session
        });
        if (res.data.status === 'ok') return res.data.solution.response;
    } catch (e) { return null; }
    return null;
}
async function destroySession(session: string) {
    axios.post(FLARESOLVERR_URL, { cmd: 'sessions.destroy', session }).catch(() => {});
}