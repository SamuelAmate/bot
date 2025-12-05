import { createCommand } from "#base";
import { ApplicationCommandType } from "discord.js";
// 💡 CORREÇÃO DO CAMINHO: Subir dois níveis (../../)
import { monitorMangas } from '../../tasks/MonitorManga.js';

createCommand({
    name: "rodar-monitoramento",
    description: "Inicia a tarefa de monitoramento de mangás imediatamente (manutenção).",
    type: ApplicationCommandType.ChatInput,
    
    async run(interaction) {
        if (!interaction.isChatInputCommand() || !interaction.guild) return;
        
        await interaction.reply({ 
            content: "⏳ Iniciando tarefa de monitoramento de mangás em segundo plano...",
            ephemeral: true
        });

        try {
            // Chama a função da Task, passando a instância do bot
            await monitorMangas(interaction.client);

            // A resposta final (followUp) só é enviada após a conclusão de TODAS as verificações.
            await interaction.followUp({ 
                content: "✅ Monitoramento concluído! Verifique os canais para novas notificações.",
                ephemeral: true
            });
        } catch (error) {
            console.error("Erro durante a execução manual do monitoramento:", error);
            await interaction.followUp({ 
                content: "❌ Ocorreu um erro fatal durante a execução do monitoramento. Verifique o console.",
                ephemeral: true
            });
        }
    }
});