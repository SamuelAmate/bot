// Em src/events/ReadyEvent.ts
import { createEvent } from '#base';
import cron from 'node-cron';
import { monitorMangas } from '../tasks/MonitorManga.js';
import { loadState } from '../utils/StateManager.js';
import { wakeUpRender } from '../utils/Scraper.js'; // <--- Importe a nova função

export default createEvent({
    name: "ready",
    event: "ready",
    once: true,
    
    async run(..._args: any[]) { 
        const bot = this as any; 
        
        if (!bot || !bot.user) {
            console.error("Erro no bot.");
            return;
        }

        console.log(`Bot online como ${bot.user.tag}`);
        loadState();

        // --- MUDANÇA AQUI ---
        // 1. Tenta acordar o Render antes de começar a monitorar
        await wakeUpRender();

        // 2. Agora sim roda a verificação
        console.log('[INIT] Rodando primeira verificação...');
        monitorMangas(bot);

        // 3. Cron Job
        cron.schedule('*/10 * * * *', () => {
            console.log('[CRON] Iniciando monitoramento de mangás...');
            monitorMangas(bot); 
        });
    }
});
