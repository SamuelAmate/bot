import { createCommand } from "#base";
import { ApplicationCommandType, PermissionFlagsBits } from "discord.js";
// 💡 CORREÇÃO DO CAMINHO: Subir dois níveis (../../)
import { getMangas, removeManga } from '../../utils/StateManager.js';

createCommand({
    name: "remover-obra",
    description: "Remove uma obra da lista de monitoramento.",
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
    options: [
        {
            name: "titulo",
            description: "O título da obra que você deseja remover.",
            type: 3, // STRING
            required: true
        }
    ],
    async run(interaction) {
        if (!interaction.isChatInputCommand() || !interaction.guild) return;
        
        const tituloParaRemover = interaction.options.getString("titulo", true);
        const mangas = getMangas();

        // 1. Encontra a obra pelo título
        const mangaParaRemover = mangas.find(m => m.titulo?.toLowerCase() === tituloParaRemover.toLowerCase());

        if (!mangaParaRemover) {
            await interaction.reply({ 
                content: `❌ Obra com o título **"${tituloParaRemover}"** não encontrada na lista.`,
                ephemeral: true
            });
            return;
        }

        // 2. Remove a obra usando a URL Base como chave
        const sucesso = removeManga(mangaParaRemover.titulo);

        if (sucesso) {
            await interaction.reply({ 
                content: `✅ Obra **"${mangaParaRemover.titulo}"** removida com sucesso!`,
            });
        } else {
            // Este caso é improvável se a obra foi encontrada antes.
            await interaction.reply({ 
                content: `❌ Erro ao remover a obra. Verifique se o título está correto.`,
                ephemeral: true
            });
        }
    }
});