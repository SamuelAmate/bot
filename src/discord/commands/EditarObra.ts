import { createCommand } from "#base";
import { createFileUpload, createLabel, createModalFields, createTextInput } from "@magicyan/discord";
import { ApplicationCommandOptionType, ApplicationCommandType, ChannelSelectMenuBuilder, ChannelType, PermissionFlagsBits, TextInputStyle } from "discord.js";

import { getMangas } from '../../utils/StateManager.js';

createCommand({
    name: "editar-obra",
    description: "Editar url, imagem e a mensagem de uma obra cadastrada.",
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
    options: [
        {
            name: "titulo_atual",
            description: "O título da obra que você deseja editar.",
            type: ApplicationCommandOptionType.String, 
            required: true
        }
    ],
    async run(interaction){
        console.log("--- [CMD: editar-obra] Iniciado ---");
        if (!interaction.isChatInputCommand()) return;

        const tituloAtual = interaction.options.getString("titulo_atual", true);
        const mangas = getMangas();

        const manga = mangas.find(m => m.titulo?.toLowerCase() === tituloAtual.toLowerCase());

        if (!manga) {
            await interaction.reply({ 
                content: `❌ Obra **"${tituloAtual}"** não encontrada.`,
                ephemeral: true
            });
            return;
        }

        console.log(`[CMD] Obra encontrada: ${manga.titulo}`);

        // Limpeza da URL
        let baseLimpa = manga.urlBase.replace(/\/+$/, ""); 
        baseLimpa = baseLimpa.replace(/\/\d+$/, "");
        const urlCompletaAtual = `${baseLimpa}/${manga.lastChapter}/`.replace(/\/\/+/g, '/').replace('http:/', 'http://').replace('https:/', 'https://');
        
        try {
            await interaction.showModal({
                customId: "modal-editar-obra", 
                title: `Editar: ${manga.titulo.substring(0, 30)}`,
                components: createModalFields(
                    createLabel(
                        "Url (Sakura)",
                        "Novo link do último capítulo no Sakura",
                        createTextInput({ 
                            customId: "nova_url", 
                            required: true, 
                            value: urlCompletaAtual 
                        })
                    ),
                    createLabel(
                        "Mensagem",
                        "Nova mensagem padrão (opcional)",
                        createTextInput({ 
                            customId: "nova_mensagem", 
                            required: false, 
                            style: TextInputStyle.Paragraph,
                            value: manga.mensagemPadrao || "" 
                        })
                    ),
                    createLabel(
                        "Imagem",
                        "Nova imagem da capa (opcional)",
                        createFileUpload({
                            customId: "imagem", 
                            required: false,
                            maxValues: 1
                        })
                    ),
                    // Campo "oculto" para passar o título original para o responder
                    createLabel(
                        "Obra (NÃO ALTERAR)", 
                        "Identificador interno da obra",
                        createTextInput({
                            customId: "titulo_referencia",
                            required: true,
                            value: manga.titulo
                        })
                    ),
                    createLabel(
                            "Canal",
                            "Selecione onde a mensagem será enviada",
                            new ChannelSelectMenuBuilder({
                            customId: "canal",
                            required: true,
                            channelTypes: [
                            ChannelType.GuildText,
                            ChannelType.GuildAnnouncement
                                    ]
                                })     
                                .setDefaultChannels([manga.channelId])           
                            )
                )
            });
            console.log("[CMD] Modal aberto com sucesso!");
        } catch (error) {
            console.error("[CMD] ERRO:", error);
        }
    }
});