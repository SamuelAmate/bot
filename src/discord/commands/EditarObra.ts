import { createCommand } from "#base";
import { createLabel, createModalFields, createTextInput } from "@magicyan/discord";
import { ApplicationCommandType } from "discord.js";
import { getMangas } from '../../utils/StateManager.js';

createCommand({
    name: "editar-obra",
    description: "Edita a URL e a mensagem de uma obra cadastrada.",
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "titulo_atual",
            description: "O título da obra que você deseja editar.",
            type: 3, 
            required: true
        }
    ],
    async run(interaction){
        if (!interaction.isChatInputCommand()) return;

        const tituloAtual = interaction.options.getString("titulo_atual", true);
        const mangas = getMangas();

        const manga = mangas.find(m => m.titulo?.toLowerCase() === tituloAtual.toLowerCase());

        if (!manga) {
            await interaction.reply({ 
                content: `❌ Obra com o título **"${tituloAtual}"** não encontrada.`,
                ephemeral: true
            });
            return;
        }

        // URL do último capítulo completo (para pré-preencher o campo)
        const urlCompletaAtual = `${manga.urlBase}${manga.lastChapter}/`;

        await interaction.showModal({
            // Passamos o título da obra na customId para sabermos qual editar
            customId: `/obras/editar/${manga.urlBase}`, 
            title: `Editar Obra: ${manga.titulo}`,
            components: createModalFields(
                createLabel(
                    "Url",
                    "Novo link do ÚLTIMO CAPÍTULO (Ex: https://.../obra/8/)",
                    createTextInput({ 
                        customId: "nova_url", 
                        required: true,
                        value: urlCompletaAtual // Preenche com o valor atual
                    })
                ),
                createLabel(
                    "Mensagem",
                    "Nova mensagem padrão para notificação (opcional)",
                    createTextInput({ 
                        customId: "nova_mensagem", 
                        required: false, 
                        style: 2, // TextInputStyle.Paragraph
                        value: manga.mensagemPadrao 
                    })
                ),
            )
        })
    }
});