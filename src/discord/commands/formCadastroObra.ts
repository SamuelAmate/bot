import { createCommand } from "#base";
import { createFileUpload, createLabel, createModalFields, createTextInput } from "@magicyan/discord";
import { ApplicationCommandType, ChannelSelectMenuBuilder, ChannelType, TextInputStyle } from "discord.js";

createCommand({
    name: "cadastro-obra-lancamento",
    description: "Preencha o formulario",
    type: ApplicationCommandType.ChatInput,
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
                    "Cole os links aqui (um por linha ou separados por espaço) - O link do Sakura deve ser do último capítulo postado e do MangaPark/MangaTaro devem ser o link da página da obra.",
                    createTextInput({
                        customId: "todos_links",
                        required: true,
                        style: TextInputStyle.Paragraph,
                        placeholder: "https://sakuramangas.org/obras/witchriv/7/\nhttps://mangapark.io/title/431933-pt_br-witchriv\nhttps://mangataro.org/manga/witchriv"
                    })
                ),
                createLabel(
                    "Mensagem",
                    "Mensagem que será enviada no lançamento, não mexer nas palavras entre chaves {}",
                    createTextInput({
                        customId: "mensagem",
                        required: true,
                        style: TextInputStyle.Paragraph,
                        value: "O **capítulo {capitulo}** de @{titulo}, **\"{nome_capitulo}\"** já está disponível.\n\n*aproveitem e boa leitura.*\n\n"
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