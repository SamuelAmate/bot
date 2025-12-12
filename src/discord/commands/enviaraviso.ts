import { createCommand } from "#base";
import { createFileUpload, createLabel, createModalFields, createTextInput } from "@magicyan/discord";
import { ApplicationCommandType, ChannelSelectMenuBuilder, ChannelType, TextInputStyle, PermissionFlagsBits } from "discord.js";

createCommand({
    name: "enviar-post-semanal",
    description: "Preencha o formulario para enviar aviso",
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
    async run(interaction){
        await interaction.showModal({
            customId: "enviar-post-semanal",
            title: "Formulario pra enviar post semanal",
            components: createModalFields(
                createLabel(
                    "Mensagem",
                    "Mensagem que será enviada",
                    createTextInput({
                        customId: "mensagem", // ID Importante
                        required: true,
                        style: TextInputStyle.Paragraph,
                        value: "**Post Novo**\n\nTexto Aqui\n\n*aproveitem e boa leitura!*\n\n"
                    })
                ),
                createLabel(
                    "Cargos Mencionados",
                    "Por padrão ele puxa os cargos do Sandwiche, se voce preencher algo ele vai usar somente o cargo que você digitar.",
                    createTextInput({
                        customId: "mencao_manual",
                        required: false,
                        style: TextInputStyle.Short,
                        placeholder: "@everyone"
                    })
                ),
                createLabel(
                    "Imagem",
                    "Imagem que sera enviada junto",
                    createFileUpload({
                        customId: "imagem",
                        required: false,
                        maxValues: 1
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
                ),
            )
        })
    }
});