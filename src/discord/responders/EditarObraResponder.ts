import { createResponder, ResponderType } from "#base";
import { addManga, getMangas, MangaEntry, removeManga } from '../../utils/StateManager.js';

createResponder({
    // Captura qualquer customId que comece com /obras/editar/
    customId: "/obras/editar",
    types: [ResponderType.Modal], 
    cache: "cached",
    async run(interaction) {
        if (!interaction.isModalSubmit() || !interaction.guild) return;

        const { fields } = interaction;
        
        // A chave da obra (urlBase) está no customId, após o último '/'
        const urlBaseParaEditar = interaction.customId.split('/').pop();
        
        const novaUrlCompleta = fields.getTextInputValue("nova_url");
        const novaMensagem = fields.getTextInputValue("nova_mensagem");

        // 1. Extrai a nova URL Base e Capítulo
        const match = novaUrlCompleta.match(/(\d+)\/?$/); 

        if (!match || !urlBaseParaEditar) {
            await interaction.reply({ flags: ["Ephemeral"], content: "❌ Erro interno. Tente novamente ou contate o administrador." });
            return;
        }

        const novoCap = parseInt(match[1]);
        const novaUrlBase = novaUrlCompleta.substring(0, novaUrlCompleta.length - match[1].length); 
        
        // 2. Busca o objeto original no estado
        const mangas = getMangas();
        const mangaOriginal = mangas.find(m => m.urlBase === urlBaseParaEditar);

        if (!mangaOriginal) {
            await interaction.reply({ flags: ["Ephemeral"], content: "❌ A obra que você está tentando editar não foi encontrada no banco de dados." });
            return;
        }
        
        // 3. Verifica se a nova URL é válida (opcional, mas recomendado)
        // Você pode chamar o getLatestChapter aqui para verificar se a nova URL base funciona,
        // mas vamos apenas confiar que o usuário digitou corretamente para simplificar.

        // 4. Cria e salva o objeto atualizado
        const updatedManga: MangaEntry = {
            ...mangaOriginal,
            urlBase: novaUrlBase, // Pode ter mudado
            lastChapter: novoCap, // Novo capítulo de partida
            mensagemPadrao: novaMensagem,
        };
        
        // Se a urlBase mudou, removemos a antiga e adicionamos a nova.
        if (urlBaseParaEditar !== novaUrlBase) {
            removeManga(urlBaseParaEditar);
        }
        
        addManga(updatedManga); // addManga já cuida de atualizar se a chave for a mesma

        await interaction.reply({
            flags: ["Ephemeral"],
            content: `✅ Obra **${mangaOriginal.titulo}** editada com sucesso!
Novo Capítulo de partida: **${novoCap}**
Nova URL Base: \`${novaUrlBase}\``
        });
    }
});