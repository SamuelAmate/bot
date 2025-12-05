import axios from "axios";

// O código pega a URL do .env da Oracle.
// Se não achar, tenta localhost (mas no seu caso vai achar o do Render)
const FLARESOLVERR_BASE_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191';

export async function closeBrowser() {
    // Placeholder
}

export async function getLatestChapter(urlBase: string, ultimoCapConhecido: number): Promise<number> {
    
    let capAtual = ultimoCapConhecido;
    
    while (true) {
        const proximoCap = capAtual + 1;
        const urlParaTestar = `${urlBase}${proximoCap}/`;
        
        console.log(`[REQ] Solicitando ao FlareSolverr (Render): ${urlParaTestar}`);

        try {
            // AQUI ESTÁ O SEGREDO:
            // O código monta: https://seubot.onrender.com + /v1
            const response = await axios.post(`${FLARESOLVERR_BASE_URL}/v1`, {
                cmd: 'request.get',
                url: urlParaTestar,
                maxTimeout: 120000, // 2 min para o Render acordar e processar
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 130000 // Timeout de conexão (2m e 10s)
            });

            const dados = response.data;

            if (dados.status !== 'ok') {
                console.error(`[FLARE ERROR] O serviço falhou: ${dados.message}`);
                // Se der erro 500 no Render, pode ser instabilidade lá
                break;
            }

            const urlFinal = dados.solution.url;

            // --- Lógica de Validação (Igual ao seu original) ---
            if (urlFinal === 'https://sakuramangas.org/' ||
                urlFinal === 'https://sakuramangas.org' ||
                !urlFinal.includes(`/${proximoCap}/`)) {
                
                console.log(`[FIM] Redirecionado para: ${urlFinal}.`);
                break;
            }

            const httpStatus = dados.solution.status;
            console.log(`[RES] URL Final: ${urlFinal} | Status: ${httpStatus}`);

            if (httpStatus >= 200 && httpStatus < 300) {
                capAtual = proximoCap;
            } else if (httpStatus === 404) {
                break;
            } else if (httpStatus === 403 || httpStatus === 503) {
                console.error(`[BLOQUEIO] Cloudflare ou Render instável.`);
                break;
            } else {
                console.error(`[ERRO HTTP] Status: ${httpStatus}`);
                break;
            }

        } catch (error: any) {
            console.error(`[FALHA DE CONEXÃO] Erro ao conectar no Render.`);
            // Se der timeout aqui, é porque o Render demorou mais de 2 minutos para ligar
            console.error(`Erro: ${error.message}`);
            break;
        }
    }
    
    return capAtual;
}