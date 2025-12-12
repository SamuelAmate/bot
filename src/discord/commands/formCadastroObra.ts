import { createCommand } from "#base";
import { createFileUpload, createLabel, createModalFields, createTextInput } from "@magicyan/discord";
import { ApplicationCommandType, ChannelSelectMenuBuilder, ChannelType, PermissionFlagsBits, TextInputStyle, } from "discord.js";

createCommand({
    name: "cadastro-obra-lancamento",
    description: "Preencha o formulario",
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
    async run(interaction){
        await interaction.showModal({
            customId: "/obras/cadastro",
            title: "Formulario de Cadastro de Obra",
            components: createModalFields(
                createLabel(
                    "Titulo da Obra",
                    "Tem que ser o mesmo da tag do discord",
                    createTextInput({
                        customId: "titulo",
                        required: true,
                    })
                ),
                createLabel(
                    "Links (Sakura, MangaPark, MangaTaro)",
                    "Cole 1 link por linha. Sakura usar link do ultimo capitulo, os demais da pagina da obra",
                    createTextInput({
                        customId: "todos_links",
                        required: true,
                        style: TextInputStyle.Paragraph,
                        placeholder: "https://sakuramangas.org/obras/witchriv/7/\nhttps://mangapark.io/\nhttps://mangataro.org"
                    })
                ),
                createLabel(
                    "Mensagem",
                    "Mensagem que será enviada no lançamento, não mexer nas palavras entre chaves {}",
                    createTextInput({
                        customId: "mensagem",
                        required: true,
                        style: TextInputStyle.Paragraph,
                        value: "O **capítulo {capitulo}** de @{titulo}, **\"{nome_capitulo}\"**, já está disponível.\n\n*Aproveitem e boa leitura!*\n\n"
                    })
                ),
                createLabel(
                    "Imagem",
                    "Imagem que sera enviada junto da mensagem",
                    createFileUpload(
                        "imagem", false, 1
                    )
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