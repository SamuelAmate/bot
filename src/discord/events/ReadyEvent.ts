import { createEvent } from '#base';
import { Client } from 'discord.js';
import cron from 'node-cron';
import { monitorMangas } from '../../tasks/MonitorManga.js';
import { loadState } from '../../utils/StateManager.js';
import { wakeUpRender } from '../../utils/Scraper.js'; 

if (!process.stdout.clearLine) {
    // @ts-ignore
    process.stdout.clearLine = () => {};
    // @ts-ignore
    process.stdout.cursorTo = () => {};
}

export default createEvent({
    name: "ReadyHandler",
    event: "ready",
    once: true,
    
    async run() { 
        console.log("!!! EVENTO READY DISPARADO !!!"); // Log de vida imediato

        const bot = this as unknown as Client; 
        
        // 1. Carrega Estado
        loadState();
        console.log("[Ready] Banco de dados carregado.");

        // 2. Acorda o Scraper (EM SEGUNDO PLANO - SEM AWAIT)
        // Isso impede que uma falha de rede trave o bot de ligar
        wakeUpRender().then(() => {
            console.log("[Background] Verificação inicial do Flaresolverr concluída.");
        }).catch(err => {
            console.error("[Background] Erro ao acordar Flaresolverr:", err);
        });

        // 3. Verifica Mangás imediatamente (EM SEGUNDO PLANO)
        monitorMangas(bot).catch(err => console.error("[Ready] Erro na verificação inicial:", err));

        // 4. Inicia o Cron Job (CRUCIAL)
        console.log(`[Ready] Configurando Cron Job para rodar a cada 10 minutos...`);
        
        // Validação: Verifica se o cron é válido
        if (!cron.validate('*/10 * * * *')) {
            console.error("[Ready] ERRO: Sintaxe do Cron inválida!");
        }

        const tarefa = cron.schedule('*/10 * * * *', () => {
            const agora = new Date().toISOString();
            console.log(`[Cron] ⏰ Executando monitoramento automático: ${agora}`);
            monitorMangas(bot); 
        });

        tarefa.start(); // Força o inicio
        console.log('[Ready] ✅ Sistema de Cronogramas ATIVO e rodando!');
    }
});