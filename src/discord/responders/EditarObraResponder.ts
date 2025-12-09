import { createResponder, ResponderType } from "#base";
import { addManga, getMangas, MangaEntry } from '../../utils/StateManager.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { pipeline } from 'stream/promises';

// Define o caminho absoluto para as imagens
const IMAGE_DIR = path.resolve(process.cwd(), 'imagens');

// Garante que a pasta existe (só por segurança)
if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

createResponder({
    customId: "modal-editar-obra",
    types: [ResponderType.Modal], 
    cache: "cached",
    async run(interaction): Promise<void> { 
        console.log("\n--- [RESPONDER] Iniciado (Edição) ---");

        if (!interaction.isModalSubmit() || !interaction.guild) return;

        // Evita timeout
        try {
            await interaction.deferReply();
        } catch (e) { return; }

        try {
            const { fields } = interaction;

            // RECUPERA OS DADOS
            const novaUrlCompleta = fields.getTextInputValue("nova_url");
            const novaMensagem = fields.getTextInputValue("nova_mensagem");
            const tituloObraOriginal = fields.getTextInputValue("titulo_referencia");
            
            console.log(`[RESPONDER] Editando obra: "${tituloObraOriginal}"`);

            // Captura imagem nova (se houver)
            const imagens = fields.getUploadedFiles("imagem"); 
            const imagemAnexada = imagens?.first(); 

            // 1. Processa URL
            const match = novaUrlCompleta.match(/(\d+)\/?$/); 
            if (!match) {
                await interaction.editReply({ content: "❌ A URL precisa terminar com o número do capítulo." });
                return;
            }

            const novoCap = parseInt(match[1]);
            let novaUrlBase = novaUrlCompleta.substring(0, novaUrlCompleta.length - match[0].length);
            novaUrlBase = novaUrlBase.replace(/\/+$/, "") + "/";

            // 2. Busca Obra Original
            const mangas = getMangas();
            const mangaOriginal = mangas.find(m => m.titulo === tituloObraOriginal);

            if (!mangaOriginal) {
                await interaction.editReply({ content: `❌ Erro crítico: Obra "${tituloObraOriginal}" não encontrada no banco.` });
                return;
            }

            // 3. Atualização da Imagem (Download Local)
            let caminhoImagemFinal = mangaOriginal.imagem || ""; // Mantém a antiga por padrão

            if (imagemAnexada) {
                console.log("[RESPONDER] Nova imagem detectada. Iniciando substituição...");
                try {
                    // Se já existia uma imagem antiga, tenta deletar para não acumular lixo
                    if (mangaOriginal.imagem && fs.existsSync(mangaOriginal.imagem)) {
                        try {
                            fs.unlinkSync(mangaOriginal.imagem);
                            console.log(`[RESPONDER] Imagem antiga deletada: ${mangaOriginal.imagem}`);
                        } catch (delErr) {
                            console.warn("[RESPONDER] Falha ao deletar imagem antiga (ignorado):", delErr);
                        }
                    }

                    // Prepara o download da nova
                    const safeTitle = tituloObraOriginal.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const extensao = path.extname(imagemAnexada.name) || '.png'; 
                    const nomeArquivo = `${safeTitle}_${Date.now()}${extensao}`; // Timestamp evita cache
                    const caminhoCompleto = path.join(IMAGE_DIR, nomeArquivo);

                    // Download
                    const response = await axios.get(imagemAnexada.url, { responseType: 'stream' });
                    await pipeline(response.data, fs.createWriteStream(caminhoCompleto));

                    caminhoImagemFinal = caminhoCompleto;
                    console.log(`[RESPONDER] Nova imagem salva em: ${caminhoImagemFinal}`);

                } catch (e) {
                    console.error("[RESPONDER] Erro ao baixar nova imagem:", e);
                    await interaction.editReply({ content: "❌ Erro ao salvar a nova imagem. As outras alterações foram salvas, mas a imagem antiga foi mantida." });
                    // Não damos return aqui para salvar o resto das alterações
                }
            }

            // 4. Salva as Alterações
            const updatedManga: MangaEntry = {
                ...mangaOriginal,
                urlBase: novaUrlBase,
                lastChapter: novoCap, 
                mensagemPadrao: novaMensagem || undefined,
                imagem: caminhoImagemFinal // Atualiza com o novo caminho (ou mantém o antigo)
            };
            
            addManga(updatedManga);

            await interaction.editReply({
                content: `✅ **${mangaOriginal.titulo}** editada com sucesso!
    **Monitorando a partir de:** Capítulo ${novoCap}
    **Imagem:** ${imagemAnexada ? "Atualizada" : "Mantida"}`
            });
            console.log("[RESPONDER] Sucesso!");

        } catch (error) {
            console.error("[RESPONDER] Erro Fatal:", error);
            await interaction.editReply({ content: "❌ Ocorreu um erro interno ao processar a edição." });
        }
    }
});