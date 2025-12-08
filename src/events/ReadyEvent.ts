// Em src/events/ReadyEvent.ts
import { createEvent } from '#base';
import { Client } from 'discord.js';
import cron from 'node-cron';
import { monitorMangas } from '../tasks/MonitorManga.js';
import { loadState } from '../utils/StateManager.js';
import { wakeUpRender } from '../utils/Scraper.js'; 

export default createEvent({
    name: "ready",
    event: "ready",
    once: true,
    
    async run() { 
        const bot = this as unknown as Client; 
        
        if (!bot || !bot.user) {
            console.error("[Ready] Erro crítico: Cliente do bot não inicializado corretamente.");
            return;
        }

        console.log(` [Ready] Bot online como ${bot.user.tag}`);

        loadState();

        // 2. Acorda/Verifica o Scraper (Flaresolverr)
        await wakeUpRender();

        // 3. Executa a primeira verificação imediatamente
        console.log('[Ready] Rodando verificação inicial de mangás...');
        monitorMangas(bot);

        // 4. Inicia o Cron Job (a cada 10 minutos)
        // Dica: '*/10' roda no minuto 0, 10, 20...
        cron.schedule('*/10 * * * *', () => {
            console.log(' [Cron] Iniciando ciclo de monitoramento...');
            monitorMangas(bot); 
        });

        console.log('[Ready] Sistema de cronogramas iniciado.');
    }
});