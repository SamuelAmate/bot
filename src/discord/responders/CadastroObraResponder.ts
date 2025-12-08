import { createResponder, ResponderType } from "#base";
import { SendableChannels } from "discord.js";
import { addManga, MangaEntry } from '../../utils/StateManager.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { pipeline } from 'stream/promises';

// Define o caminho absoluto para evitar erros de pasta relativa
const IMAGE_DIR = path.resolve(process.cwd(), 'imagens');

// Garante que a pasta existe ao iniciar
if (!fs.existsSync(IMAGE_DIR)) {
    console.log(`[Sistema] Criando pasta de imagens em: ${IMAGE_DIR}`);
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

createResponder({
    customId: "/obras/cadastro",
    types: [ResponderType.Modal], 
    cache: "cached",
    async run(interaction) {
        if (!interaction.isModalSubmit() || !interaction.guild) return;
        
        console.log(`[Cadastro] Iniciando processamento do modal para: ${interaction.user.tag}`);

        // 1. AVISA O DISCORD QUE ESTAMOS PROCESSANDO (Evita o erro de timeout de 3s)
        try {
            await interaction.deferReply(); 
        } catch (e) {
            console.error("[Cadastro] Erro ao deferir resposta (Timeout muito rápido?):", e);
            return;
        }

        try {
            const { fields } = interaction;
            const titulo = fields.getTextInputValue("titulo");
            console.log(`[Cadastro] Título recebido: ${titulo}`);
            
            // --- PROCESSAMENTO DE LINKS ---
            const textoLinks = fields.getTextInputValue("todos_links");
            const listaUrls = textoLinks.split(/[\s,\n]+/).filter(url => url.startsWith("http"));

            const urlSakura = listaUrls.find(u => u.includes("sakura") || u.includes("lermanga") || u.includes("golden"));
            const urlMangapark = listaUrls.find(u => u.includes("mangapark"));
            const urlMangataro = listaUrls.find(u => u.includes("mangataro"));

            console.log(`[Cadastro] Links identificados - Sakura: ${!!urlSakura}, MP: ${!!urlMangapark}, MT: ${!!urlMangataro}`);

            if (!urlSakura) {
                console.warn("[Cadastro] Falha: Link Sakura ausente.");
                await interaction.editReply({ content: "❌ **Erro:** Você precisa fornecer pelo menos o link do **Sakura**." });
                return;
            }

            // Pega o capítulo do link do Sakura
            const match = urlSakura.match(/(\d+)\/?$/); 
            if (!match) {
                console.warn(`[Cadastro] Falha: Não achei número no link: ${urlSakura}`);
                await interaction.editReply({ content: "❌ Não foi possível detectar o número do capítulo no link do Sakura." });
                return;
            }
            const ultimoCap = parseInt(match[1]);
            const urlBase = urlSakura.substring(0, urlSakura.length - match[0].length) + '/';

            // --- PROCESSAMENTO DE CAMPOS EXTRAS ---
            const mensagemPadrao = fields.getTextInputValue("mensagem");
            const imagens = fields.getUploadedFiles("imagem"); 
            const imagemAnexada = imagens?.first(); 

            const canaisSelecionados = fields.getSelectedChannels("canal");
            const canalDestino = canaisSelecionados ? canaisSelecionados.first() as SendableChannels : null;

            if (!canalDestino) {
                console.warn("[Cadastro] Falha: Canal inválido.");
                await interaction.editReply({ content: "❌ Canal inválido." });
                return;
            }

            // --- DOWNLOAD DA IMAGEM ---
            let caminhoImagemLocal = "";
            
            if (imagemAnexada) {
                console.log(`[Cadastro] Imagem detectada. Iniciando download de: ${imagemAnexada.url}`);
                try {
                    // Limpa o nome do arquivo para não dar erro no Linux
                    const safeTitle = titulo.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const extensao = path.extname(imagemAnexada.name) || '.png'; 
                    // Adiciona timestamp para evitar cache ou sobreposição
                    const nomeArquivo = `${safeTitle}_${Date.now()}${extensao}`;
                    const caminhoCompleto = path.join(IMAGE_DIR, nomeArquivo);

                    // Faz o download
                    const response = await axios.get(imagemAnexada.url, { responseType: 'stream' });
                    await pipeline(response.data, fs.createWriteStream(caminhoCompleto));

                    caminhoImagemLocal = caminhoCompleto; 
                    console.log(`[Cadastro] Imagem salva com sucesso em: ${caminhoImagemLocal}`);

                } catch (e) { 
                    console.error("[Cadastro] ERRO CRÍTICO AO BAIXAR IMAGEM:", e);
                    await interaction.editReply({ content: `⚠️ **Erro ao salvar a imagem.**\nO cadastro foi cancelado.\nErro: ${e}` });
                    return;
                }
            } else {
                console.log("[Cadastro] Nenhuma imagem anexada. Seguindo sem imagem.");
            }

            // --- SALVANDO NO BANCO ---
            console.log("[Cadastro] Salvando dados no StateManager...");
            
            const newEntry: MangaEntry = {
                titulo: titulo,
                urlBase: urlBase,
                lastChapter: ultimoCap, 
                channelId: canalDestino.id,
                mensagemPadrao: mensagemPadrao,
                imagem: caminhoImagemLocal, 
                urlMangapark: urlMangapark, 
                urlMangataro: urlMangataro,
            };

            addManga(newEntry);
            console.log("[Cadastro] Dados salvos com sucesso!");
            
            await interaction.editReply({
                content: `✅ **${titulo}** cadastrado com sucesso!\n📁 **Imagem:** ${caminhoImagemLocal ? 'Salva no servidor' : 'Nenhuma'}\n🌸 **Monitorando:** a partir do Cap ${ultimoCap}`
            });

        } catch (err) {
            console.error("####################################");
            console.error("[Cadastro] ERRO NÃO TRATADO (CRASH):");
            console.error(err);
            console.error("####################################");
            
            // Tenta avisar o usuário que deu erro
            try {
                await interaction.editReply({ content: "☠️ Ocorreu um erro interno fatal no bot ao processar o cadastro. Verifique os logs do terminal." });
            } catch (ignore) {}
        }
    }
});