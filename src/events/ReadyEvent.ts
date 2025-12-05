// Em src/events/ReadyEvent.ts

import { createEvent } from '#base';
import cron from 'node-cron';
import { monitorMangas } from '../tasks/MonitorManga.js';
import { loadState } from '../utils/StateManager.js';

export default createEvent({
    name: "ready", // nome do evento
    event: "ready", 
    once: true,    // roda apenas uma vez
    
    async run(..._args: any[]) { 
        
        // Em um evento Constatic, 'this' é a instância do Cliente (o Bot)
        const bot = this as any; 
        
        if (!bot || !bot.user) {
            console.error("Instância do bot não encontrada no contexto 'this'.");
            return;
        }

        console.log(`Bot online como ${bot.user.tag}`);

        // 1. Carregar o estado
        loadState();

        // 2. Agendar a tarefa de monitoramento a cada 10 minutos
        cron.schedule('*/10 * * * *', () => {
            console.log('[CRON] Iniciando monitoramento de mangás...');
            monitorMangas(bot); 
        });

        // Opcional: Roda a primeira vez imediatamente
        monitorMangas(bot);
    }
});