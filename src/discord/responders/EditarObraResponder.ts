import { createResponder, ResponderType } from "#base";
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { addManga, getMangas, MangaEntry } from '../../utils/StateManager.js';

const IMAGE_DIR = path.resolve(process.cwd(), 'imagens');

createResponder({
    customId: "modal-editar-obra",
    types: [ResponderType.Modal], 
    cache: "cached",
    async run(interaction): Promise<void> { 
        if (!interaction.isModalSubmit() || !interaction.guild) return;
        try { await interaction.deferReply(); } catch (e) { return; }

        try {
            const { fields } = interaction;
            const novaUrlCompleta = fields.getTextInputValue("nova_url");
            const novaMensagem = fields.getTextInputValue("nova_mensagem");
            const tituloObraOriginal = fields.getTextInputValue("titulo_referencia");
            const imagens = fields.getUploadedFiles("imagem"); 
            const imagemAnexada = imagens?.first(); 

            // --- 1. Busca a Obra Original Primeiro ---
            // Precisamos dela antes para saber qual é o canal antigo
            const mangas = getMangas();
            const mangaOriginal = mangas.find(m => m.titulo === tituloObraOriginal);

            if (!mangaOriginal) {
                await interaction.editReply({ content: `❌ Erro crítico: Obra "${tituloObraOriginal}" não encontrada no banco.` });
                return;
            }

            // --- 2. Lógica do Canal (Novo ou Mantém Velho) ---
            const canaisSelecionados = fields.getSelectedChannels("canal");
            const novoCanal = canaisSelecionados ? canaisSelecionados.first() : null;
            
            // Se o usuário selecionou algo, usa o ID novo. Se não, mantém o ID antigo.
            const canalFinalId = novoCanal ? novoCanal.id : mangaOriginal.channelId;

            // --- 3. Processamento de URL ---
            const match = novaUrlCompleta.match(/(\d+(?:[-.]\d+)?)\/?$/); 
            if (!match) {
                await interaction.editReply({ content: "❌ A URL precisa terminar com o número do capítulo (ex: /69/ ou /69-1/)." });
                return;
            }

            const novoCap = parseFloat(match[1].replace('-', '.'));
            let novaUrlBase = novaUrlCompleta.substring(0, novaUrlCompleta.length - match[0].length);
            novaUrlBase = novaUrlBase.replace(/\/+$/, "") + "/";

            // --- 4. Processamento de Imagem ---
            let caminhoImagemFinal = mangaOriginal.imagem || ""; 
            if (imagemAnexada) {
                try {
                    if (mangaOriginal.imagem && fs.existsSync(mangaOriginal.imagem)) {
                        try { fs.unlinkSync(mangaOriginal.imagem); } catch (e) {}
                    }
                    const safeTitle = tituloObraOriginal.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const nomeArquivo = `${safeTitle}_${Date.now()}${path.extname(imagemAnexada.name)}`;
                    const caminhoCompleto = path.join(IMAGE_DIR, nomeArquivo);

                    const response = await axios.get(imagemAnexada.url, { responseType: 'stream' });
                    await pipeline(response.data, fs.createWriteStream(caminhoCompleto));
                    caminhoImagemFinal = caminhoCompleto;
                } catch (e) {
                    console.error("Erro imagem:", e);
                }
            }

            // --- 5. Salvar ---
            const updatedManga: MangaEntry = {
                ...mangaOriginal,
                urlBase: novaUrlBase,
                lastChapter: novoCap, 
                mensagemPadrao: novaMensagem || undefined,
                imagem: caminhoImagemFinal,
                channelId: canalFinalId 
            };
            
            addManga(updatedManga);

            await interaction.editReply({
                content: `✅ **${mangaOriginal.titulo}** editada!\n**Monitorando:** Capítulo ${novoCap}\n**Canal:** <#${canalFinalId}>`
            });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: "❌ Erro interno." });
        }
    }
});