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
        // Força a tipagem para Client para ter acesso aos métodos do bot
        const bot = this as unknown as Client; 
        
        if (!bot || !bot.user) {
            console.error("[Ready] ❌ Erro crítico: Cliente do bot não inicializado corretamente.");
            return;
        }

        console.log(`[Ready] ✅ Bot online como ${bot.user.tag}`);

        // 1. Carrega o banco de dados local (JSON)
        loadState();

        // 2. Acorda/Verifica o Scraper (Flaresolverr)
        // Isso garante que a conexão está ok antes de tentar ler mangas
        await wakeUpRender();

        // 3. Executa a PRIMEIRA verificação imediatamente (sem esperar 10 min)
        console.log('[Ready] 🚀 Rodando verificação inicial de mangás AGORA...');
        await monitorMangas(bot);

        // 4. Inicia o Cron Job (a cada 10 minutos)
        // Expressão '*/10 * * * *' significa: minutos 0, 10, 20, 30, 40, 50
        console.log('[Ready] ⏰ Agendador iniciado (Ciclos de 10 minutos).');
        
        cron.schedule('*/10 * * * *', async () => {
            // Adicionei a hora atual no log para você saber exatamente quando rodou
            const horaAtual = new Date().toLocaleTimeString('pt-BR');
            console.log(`[Cron] 🔄 Iniciando ciclo de monitoramento às ${horaAtual}...`);
            
            await monitorMangas(bot); 
        });
    }
});