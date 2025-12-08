import { createResponder, ResponderType } from "#base";
import { SendableChannels } from "discord.js";
import { addManga, getMangas, MangaEntry } from '../../utils/StateManager.js';

createResponder({
    // ⚠️ ID FIXO IGUAL AO COMANDO
    customId: "modal-editar-obra",
    types: [ResponderType.Modal], 
    cache: "cached",
    async run(interaction): Promise<void> { 
        console.log("\n--- [RESPONDER] Iniciado ---");

        if (!interaction.isModalSubmit() || !interaction.guild) return;

        // Evita timeout
        await interaction.deferUpdate().catch(console.error); 

        try {
            const { fields } = interaction;
            const channelAtual = interaction.channel as SendableChannels;

            // RECUPERA OS DADOS
            const novaUrlCompleta = fields.getTextInputValue("nova_url");
            const novaMensagem = fields.getTextInputValue("nova_mensagem");
            
            // Aqui está a mágica: Pegamos o título do campo de texto, não do ID
            const tituloObraOriginal = fields.getTextInputValue("titulo_referencia");
            console.log(`[RESPONDER] Editando obra: "${tituloObraOriginal}"`);

            // Captura imagem
            const imagens = fields.getUploadedFiles("imagem"); 
            const imagemAnexada = imagens?.first(); 

            // 1. Processa URL
            const match = novaUrlCompleta.match(/(\d+)\/?$/); 
            if (!match) {
                await interaction.followUp({ flags: ["Ephemeral"], content: "❌ A URL precisa terminar com o número do capítulo." });
                return;
            }

            const novoCap = parseInt(match[1]);
            let novaUrlBase = novaUrlCompleta.substring(0, novaUrlCompleta.length - match[0].length);
            novaUrlBase = novaUrlBase.replace(/\/+$/, "") + "/"; // Garante barra final

            // 2. Busca Obra
            const mangas = getMangas();
            // Busca exata pois o título veio intacto do formulário
            const mangaOriginal = mangas.find(m => m.titulo === tituloObraOriginal);

            if (!mangaOriginal) {
                await interaction.followUp({ flags: ["Ephemeral"], content: `❌ Erro crítico: Obra "${tituloObraOriginal}" não encontrada no banco.` });
                return;
            }

            // 3. Backup Imagem
            let urlImagemFinal = mangaOriginal.imagem || "";

            if (imagemAnexada) {
                console.log("[RESPONDER] Fazendo backup da imagem...");
                try {
                    const msgBackup = await channelAtual.send({
                        content: `**Backup de imagem:** ${mangaOriginal.titulo} não apague essa mensagem`,
                        files: [imagemAnexada.url] 
                    });
                    urlImagemFinal = msgBackup?.attachments.first()?.url || imagemAnexada.url;
                } catch (e) {
                    console.error("[RESPONDER] Erro backup:", e);
                    urlImagemFinal = imagemAnexada.url;
                }
            }

            // 4. Salva
            const updatedManga: MangaEntry = {
                ...mangaOriginal,
                urlBase: novaUrlBase,
                lastChapter: novoCap, 
                mensagemPadrao: novaMensagem || undefined,
                imagem: urlImagemFinal
            };
            
            addManga(updatedManga);

            await interaction.followUp({
                content: `✅ **${mangaOriginal.titulo}** editada com sucesso!
                                Monitorando a partir do capítulo: ${novoCap}
                                Imagem: ${imagemAnexada ? "Atualizada" : "Mantida"}`
            });
            console.log("[RESPONDER] Sucesso!");

        } catch (error) {
            console.error("[RESPONDER] Erro Fatal:", error);
            if (!interaction.replied) await interaction.followUp({ flags: ["Ephemeral"], content: "❌ Erro interno." });
        }
    }
});