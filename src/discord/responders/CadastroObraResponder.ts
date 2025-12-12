import { createResponder, ResponderType } from "#base";
import axios from 'axios';
import { SendableChannels } from "discord.js";
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { addManga, MangaEntry } from '../../utils/StateManager.js';

const IMAGE_DIR = path.resolve(process.cwd(), 'imagens');
if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });

createResponder({
    customId: "/obras/cadastro",
    types: [ResponderType.Modal], 
    cache: "cached",
    async run(interaction) {
        if (!interaction.isModalSubmit() || !interaction.guild) return;
        
        try {
            await interaction.deferReply(); 
        } catch (e) { return; }

        try {
            const { fields } = interaction;
            const titulo = fields.getTextInputValue("titulo");
            const textoLinks = fields.getTextInputValue("todos_links");
            const listaUrls = textoLinks.split(/[\s,\n]+/).filter(url => url.startsWith("http"));

            const urlSakura = listaUrls.find(u => u.includes("sakura") || u.includes("lermanga") || u.includes("golden"));
            const urlMangapark = listaUrls.find(u => u.includes("mangapark"));
            const urlMangataro = listaUrls.find(u => u.includes("mangataro"));

            if (!urlSakura) {
                await interaction.editReply({ content: "❌ **Erro:** Link do Sakura é obrigatório." });
                return;
            }

            // --- CORREÇÃO AQUI: REGEX PARA DECIMAIS ---
            // Captura números como "69", "69-1", "69.1" no final da URL
            const match = urlSakura.match(/(\d+(?:[-.]\d+)?)\/?$/); 
            
            if (!match) {
                await interaction.editReply({ content: "❌ Não foi possível detectar o número do capítulo no link do Sakura." });
                return;
            }
            
            // Converte "69-1" para "69.1"
            const rawNumber = match[1].replace('-', '.');
            const ultimoCap = parseFloat(rawNumber);
            
            // Remove o número da URL para criar a base limpa
            // Ex: .../choujin-x/69-1/ vira .../choujin-x/
            const urlBase = urlSakura.substring(0, urlSakura.length - match[0].length) + '/';

            console.log(`[Cadastro] Título: ${titulo} | Cap Inicial: ${ultimoCap} | URL Base: ${urlBase}`);

            const mensagemPadrao = fields.getTextInputValue("mensagem");
            const imagens = fields.getUploadedFiles("imagem"); 
            const imagemAnexada = imagens?.first(); 

            const canaisSelecionados = fields.getSelectedChannels("canal");
            const canalDestino = canaisSelecionados ? canaisSelecionados.first() as SendableChannels : null;

            if (!canalDestino) {
                await interaction.editReply({ content: "❌ Canal inválido." });
                return;
            }

            // --- DOWNLOAD DA IMAGEM ---
            let caminhoImagemLocal = "";
            if (imagemAnexada) {
                try {
                    const safeTitle = titulo.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const extensao = path.extname(imagemAnexada.name) || '.png'; 
                    const nomeArquivo = `${safeTitle}_${Date.now()}${extensao}`;
                    const caminhoCompleto = path.join(IMAGE_DIR, nomeArquivo);

                    const response = await axios.get(imagemAnexada.url, { responseType: 'stream' });
                    await pipeline(response.data, fs.createWriteStream(caminhoCompleto));
                    caminhoImagemLocal = caminhoCompleto; 
                } catch (e) { 
                    await interaction.editReply({ content: `❌ Erro ao salvar imagem: ${e}` });
                    return;
                }
            }

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
            
            await interaction.editReply({
                content: `✅ **${titulo}** cadastrado!\n**Monitorando a partir do:** Capítulo ${ultimoCap}\n**Canal:** <#${canalDestino.id}>`
            });

        } catch (err) {
            console.error(err);
            try { await interaction.editReply({ content: "❌ Erro interno fatal." }); } catch {}
        }
    }
});