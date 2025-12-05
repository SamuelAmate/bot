// src/discord/responders/CadastroObraResponder.ts

import { createResponder, ResponderType } from "#base";
// 💡 CORREÇÃO DO CAMINHO: Subir dois níveis (../..), pois você está em src/discord/responders
import { addManga, getMangas, MangaEntry } from '../../utils/StateManager.js';

createResponder({
    customId: "/obras/cadastro",
    types: [ResponderType.Modal], 
    cache: "cached",
    async run(interaction) {
        // Garantimos que é uma submissão de modal e que é em um canal de guilda
        if (!interaction.isModalSubmit() || !interaction.guild) {
            return;
        }

        const { fields } = interaction;
        // 💡 CORREÇÃO DE CANAL: O canal é acessível via interaction.channel
        const channel = interaction.channel;
        
        // Verifica se o canal é text-based (necessário para o fetch no MonitorManga)
        if (!channel || !channel.isTextBased()) {
            await interaction.reply({ flags: ["Ephemeral"], content: "❌ O bot não pode monitorar obras neste tipo de canal." });
            return;
        }

        const titulo = fields.getTextInputValue("titulo");
        const urlCompleta = fields.getTextInputValue("url"); 
        const mensagemPadrao = fields.getTextInputValue("mensagem") || `Novo capítulo de ${titulo} disponível!`;

        const match = urlCompleta.match(/(\d+)\/?$/); 

            if (!match) {
                // ... (lógica de erro)
                return;
                        }

            const ultimoCap = parseInt(match[1]); // Captura o 64
            const parteParaRemover = match[0]; 

            let urlBase = urlCompleta.substring(0, urlCompleta.length - parteParaRemover.length); 

            if (!urlBase.endsWith('/')) {
            urlBase += '/';
            }

        if (!match) {
            await interaction.reply({ flags: ["Ephemeral"], content: "❌ URL inválida. Certifique-se de usar o link de um capítulo, terminando com o número (ex: .../obra/7/)." });
            return;
        }
        
        // 2. Validação e Adição ao Estado
        const mangas = getMangas();
        if (mangas.some(m => m.urlBase === urlBase)) {
            await interaction.reply({ flags: ["Ephemeral"], content: `⚠️ A obra **${titulo}** já está sendo monitorada!` });
            return;
        }

        const newEntry: MangaEntry = {
            urlBase: urlBase,
            lastChapter: ultimoCap, 
            channelId: channel.id, // Usa o ID do canal onde a interação ocorreu
            titulo: titulo,
            mensagemPadrao: mensagemPadrao,
        };
        addManga(newEntry);
        
        // Resposta de sucesso
        await interaction.reply({
            flags: ["Ephemeral"],
            content: `✅ Obra **${titulo}** cadastrada! Monitoramento iniciado a partir do Cap. **${ultimoCap}**. (${getMangas().length} obras no total).`
        });
    }
});