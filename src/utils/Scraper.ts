import axios from "axios";

// O código pega a URL do .env da Oracle.
// Se não achar, tenta localhost (mas no seu caso vai achar o do Render)
const FLARESOLVERR_BASE_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191';

export async function closeBrowser() {
    // Placeholder
}


export async function getLatestChapter(urlBase: string, ultimoCapConhecido: number): Promise<number> {
    
    let capAtual = ultimoCapConhecido;
    
    // Tenta no maximo 3 vezes
    for (let i = 0; i < 3; i++) { 
        const proximoCap = capAtual + 1;
        const urlParaTestar = `${urlBase}${proximoCap}/`;
        
        console.log(`[REQ] Tentativa ${i+1}/3 no FlareSolverr: ${urlParaTestar}`);

        try {
            const response = await axios.post(`${FLARESOLVERR_BASE_URL}/v1`, {
                cmd: 'request.get',
                url: urlParaTestar,
                maxTimeout: 300000, // 5 minutos (Render é lento)
                // REMOVIDO O postData QUE CAUSAVA O ERRO
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 310000 // 5m e 10s
            });

            const dados = response.data;

            if (dados.status !== 'ok') {
                // Se o erro for "Error: Timeout...", tentamos de novo. Se for outro, logamos.
                console.error(`[FLARE ERROR] Resposta do servidor: ${dados.message}`);
                throw new Error(dados.message || "Erro desconhecido no FlareSolverr");
            }

            const urlFinal = dados.solution.url;
            const httpStatus = dados.solution.status;

            console.log(`[RES] Status: ${httpStatus} | URL: ${urlFinal}`);

            // Validação de redirecionamento para Home (Capítulo não existe)
            if (urlFinal.includes('sakuramangas.org') && !urlFinal.includes(`/${proximoCap}/`)) {
                console.log(`[FIM] Redirecionado para a home. Capítulo ${proximoCap} não existe.`);
                break; 
            }

            if (httpStatus >= 200 && httpStatus < 300) {
                capAtual = proximoCap;
                break; // Sucesso!
            } else if (httpStatus === 404) {
                break; // Não encontrado
            } else if (httpStatus === 500) {
                throw new Error("Erro 500 no site alvo (Tentar novamente)");
            } else {
                throw new Error(`Status HTTP ${httpStatus}`);
            }

        } catch (error: any) {
            console.error(`[ERRO] Tentativa ${i+1} falhou: ${error.message}`);
            
            if (i === 2) {
                console.error('[FALHA FINAL] Não foi possível verificar este mangá agora.');
                break;
            }

            console.log('[AGUARDANDO] 20 segundos para tentar novamente...');
            await new Promise(res => setTimeout(res, 20000));
        }
    }
    
    return capAtual;
}

export async function wakeUpRender(): Promise<void> {
    console.log('[SISTEMA] Tentando acordar o FlareSolverr no Render...');
    try {
        // Tenta acessar apenas a raiz para ver se responde (timeout curto de 3 min para garantir o boot)
        await axios.get(`${FLARESOLVERR_BASE_URL}`, {
            timeout: 180000 // 3 minutos para o primeiro boot
        });
        console.log('[SISTEMA] FlareSolverr está ONLINE e pronto!');
    } catch (error: any) {
        console.error(`[SISTEMA] FlareSolverr demorou para responder ou deu erro: ${error.message}`);
        // Não jogamos erro (throw) para não derrubar o bot, apenas avisamos
    }
}