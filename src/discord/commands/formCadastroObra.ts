import { createCommand } from "#base";
import { createFileUpload, createLabel, createModalFields, createTextInput } from "@magicyan/discord";
import { ApplicationCommandType, TextInputStyle } from "discord.js";

createCommand({
    name: "formCadastroObra",
    description: "Preencha o formulario",
    type: ApplicationCommandType.ChatInput,
    async run(interaction){
        await interaction.showModal({
            customId: "/obras/cadastro",
            title: "Formulario de Cadastro de Obra",
            components: createModalFields(
                createLabel(
                    "Titulo",
                    "Titulo da Obra",
                    createTextInput({
                        customId: "titulo",
                        required: true,
                    })
                ),
                createLabel(
                    "Url",
                    "Link do último capítulo no Sakura",
                    createTextInput({
                        customId: "url",
                        required: true,
                    })
                ),
                createLabel(
                    "Mensagem",
                    "Mensagem que será enviada ao servidor",
                    createTextInput({
                        customId: "mensagem",
                        required: true,
                        style: TextInputStyle.Paragraph,
                    })
                ),
                createLabel(
                    "Imagem",
                    "Imagem que sera enviada junto da mensagem",
                    createFileUpload(
                        "imagem", false, 1
                    )
                ),
            )
        })
    }
});
