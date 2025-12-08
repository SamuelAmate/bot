import { createEvent } from '#base';
import { Client } from 'discord.js';
import cron from 'node-cron';
import { monitorMangas } from '../../tasks/MonitorManga.js';
import { loadState } from '../../utils/StateManager.js';
import { wakeUpRender } from '../../utils/Scraper.js'; 

// --- CORREÇÃO DO ERRO DO PM2 (POLYFILL) ---
if (!process.stdout.clearLine) {
    // @ts-ignore
    process.stdout.clearLine = () => {};
    // @ts-ignore
    process.stdout.cursorTo = () => {};
}
// ------------------------------------------

export default createEvent({
    name: "MonitoramentoHandler",
    event: "ready",
    once: true,
    
    // AQUI ESTÁ A CORREÇÃO: Pegamos o 'client' pelo argumento, não pelo 'this'
    async run(client: Client) { 
        console.log("!!! SISTEMA DE MONITORAMENTO INICIADO !!!");

        // Garante que a variável bot seja o client recebido
        const bot = client; 
        
        if (!bot || !bot.channels) {
            console.error("❌ ERRO CRÍTICO: O objeto 'bot' não foi recebido corretamente!");
            return;
        }

        // 1. Carrega Estado
        loadState();
        console.log("[Ready] Banco de dados carregado.");

        // 2. Acorda o Scraper (EM SEGUNDO PLANO)
        wakeUpRender().then(() => {
            console.log("[Background] Verificação inicial do Flaresolverr concluída.");
        }).catch(err => {
            console.error("[Background] Erro ao acordar Flaresolverr:", err);
        });

        // 3. Verifica Mangás imediatamente
        console.log('[Ready] 🚀 Rodando verificação inicial de mangás AGORA...');
        // Passamos o 'bot' correto agora
        monitorMangas(bot).catch(err => console.error("[Ready] Erro na verificação inicial:", err));

        // 4. Inicia o Cron Job
        console.log(`[Ready] Configurando Cron Job para rodar a cada 10 minutos...`);
        
        const tarefa = cron.schedule('*/10 * * * *', () => {
            const agora = new Date().toISOString();
            console.log(`[Cron] ⏰ Executando monitoramento automático: ${agora}`);
            monitorMangas(bot); 
        });

        tarefa.start();
        console.log('[Ready] ✅ Agendador automático ATIVO!');
    }
});