import { createCommand } from "#base";
import { ApplicationCommandType, TextChannel } from "discord.js";
// 💡 CORREÇÃO DO CAMINHO: Subir dois níveis (../../) da pasta commands
import { getMangas } from '../../utils/StateManager.js';

createCommand({
    name: "simular-novo-capitulo",
    description: "Simula o lançamento de um novo capítulo para testes de notificação.",
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "titulo",
            description: "O título da obra cadastrada que você deseja simular.",
            type: 3, // STRING
            required: true
        }
    ],
    async run(interaction) {
        // Garantir que a interação é um comando e em um canal de texto
        if (!interaction.isChatInputCommand() || !interaction.guild) return;
        
        const tituloParaSimular = interaction.options.getString("titulo", true);
        const mangas = getMangas();

        // 1. Encontra a obra no estado
        const manga = mangas.find(m => m.titulo?.toLowerCase() === tituloParaSimular.toLowerCase());

        if (!manga) {
            await interaction.reply({ 
                content: `❌ Obra com o título "${tituloParaSimular}" não encontrada na lista.`,
                ephemeral: true
            });
            return;
        }

        const canal = interaction.channel;

        if (!canal || !canal.isTextBased()) {
            await interaction.reply({ 
                content: `❌ Este comando só pode ser usado em canais de texto.`,
                ephemeral: true
            });
            return;
        }

        // 2. Simula o próximo capítulo
        const capituloSimulado = manga.lastChapter + 1;
        const urlSimulada = `${manga.urlBase}${capituloSimulado}/`;
        
        // 3. Envia a notificação de teste (Lógica idêntica ao MonitorManga.ts)
        try {
            const channel = await interaction.client.channels.fetch(manga.channelId);

            // 💡 CORREÇÃO: Verificamos se é text-based E que não é nulo/indefinido
            if (channel && channel.isTextBased()) {
                
                // Faz o cast para TextBasedChannel para que o TypeScript encontre o método send()
                const textChannel = channel as TextChannel; 
                
                await textChannel.send(`[SIMULAÇÃO - SEM ATUALIZAÇÃO NO ESTADO] 
🚨 **NOVO CAPÍTULO DISPONÍVEL!** ${manga.titulo}
Capítulo **${capituloSimulado}**! 🔥
${urlSimulada}`);
                
                // Resposta no canal do comando (Ephemeral)
                await interaction.reply({ 
                    content: `✅ Simulação de notificação enviada com sucesso para o canal <#${manga.channelId}>! (Capítulo ${capituloSimulado}).`,
                    ephemeral: true
                });

            } else {
                await interaction.reply({ 
                    content: `⚠️ Canal de notificação <#${manga.channelId}> não encontrado ou não é um canal de texto.`,
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error(`Erro durante a simulação para ${manga.titulo}:`, error);
            await interaction.reply({ 
                content: `❌ Ocorreu um erro ao tentar enviar a simulação. Verifique os logs.`,
                ephemeral: true
            });
        }
        
        // 4. IMPORTANTE: Não chame addManga(updatedManga) para não alterar a contagem real.
    }
});