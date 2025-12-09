    import axios from 'axios';
    import * as cheerio from 'cheerio';

    const BASE_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191';
    const FLARESOLVERR_API = `${BASE_URL.replace(/\/$/, '')}/v1`;

    // --- HELPER: DELAY (Pausa a execução) ---
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // --- NOVA FUNÇÃO PRINCIPAL: ORQUESTRADOR ---
    // Use esta função no seu loop principal ao invés de chamar as outras diretamente
    export async function monitorarCapitulo(urlSakura: string, urlMangaPark: string, ultimoCapitulo: number) {
        
        // 1. Verifica se saiu no Sakura
        const resSakura = await verificarSeSaiuNoSakura(urlSakura, ultimoCapitulo);

        // Se não saiu nada, encerra por aqui
        if (!resSakura.saiu) {
            return null; 
        }

        console.log(`[System] Opa! Capítulo ${resSakura.numero} detectado no Sakura. Buscando no MangaPark...`);

        // 2. Primeira tentativa no MangaPark
        let resMP = await buscarLinkNaObra(urlMangaPark, resSakura.numero);

        // Lógica de verificação:
        // Se o link retornado for IGUAL à url da página da obra, significa que a função buscarLinkNaObra
        // falhou em achar o capítulo específico e retornou o fallback.
        const naoAchouNoMP = resMP.link === urlMangaPark;

        if (naoAchouNoMP) {
            console.warn(`[System] Encontrado no Sakura, mas NÃO no MangaPark. Iniciando espera de 10 minutos...`);
            
            // 3. Espera 10 minutos (10 * 60 * 1000 ms)
            await delay(10 * 60 * 1000);

            console.log(`[System] 10 minutos passaram. Tentando MangaPark novamente (Retry)...`);

            // 4. Segunda tentativa
            resMP = await buscarLinkNaObra(urlMangaPark, resSakura.numero);

            if (resMP.link === urlMangaPark) {
                console.log(`[System] Ainda não apareceu no MP. Enviando link da obra como fallback.`);
            } else {
                console.log(`[System] Sucesso! Encontrado no MP na segunda tentativa.`);
            }
        }

        // 5. Retorna o resultado final (seja o link específico ou o fallback)
        return {
            capitulo: resSakura.numero,
            linkSakura: resSakura.novaUrl,
            linkMangaPark: resMP.link,
            titulo: resMP.titulo
        };
    }

    // --- SUAS FUNÇÕES ORIGINAIS (Mantidas iguais) ---

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

    export async function verificarSeSaiuNoSakura(urlBaseSakura: string, ultimoCapitulo: number): Promise<{ saiu: boolean, numero: number, novaUrl: string }> {
        const proximoNumero = ultimoCapitulo + 1;
        
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
        } finally {
            destroySession(sessionID);
        }

        return { saiu: false, numero: ultimoCapitulo, novaUrl: urlBaseSakura };
    }

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
                    if (href.startsWith('http')) {
                        linkEncontrado = href;
                    } else {
                        const urlBase = new URL(urlPaginaObra).origin;
                        linkEncontrado = urlBase + href;
                    }

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
                // AQUI É O PULO DO GATO: Se não acha, retorna a URL da obra
                return { link: urlPaginaObra, titulo: null };
            }

        } catch (error) {
            console.error("Erro na busca MangaPark:", error);
            return { link: urlPaginaObra, titulo: null };
        } finally {
            destroySession(sessionID);
        }
    }

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