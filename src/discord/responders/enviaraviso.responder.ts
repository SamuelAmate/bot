import { createResponder, ResponderType } from "#base";
import axios from "axios";
import * as cheerio from "cheerio";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SendableChannels } from "discord.js";
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

// --- CONFIGURAÇÃO ROBUSTA DA URL DO FLARESOLVERR ---
const BASE_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191';
const FLARESOLVERR_API = `${BASE_URL.replace(/\/$/, '')}/v1`;

// --- CONFIGURAÇÃO DA PASTA DE IMAGENS ---
const IMAGE_DIR = path.resolve(process.cwd(), 'imagens');
if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

createResponder({
    customId: "enviar-post-semanal",
    types: [ResponderType.Modal],
    cache: "cached",
    async run(interaction): Promise<void> {
        if (!interaction.isModalSubmit() || !interaction.guild) return;

        await interaction.deferUpdate().catch(console.error);

        try {
            const { fields } = interaction;

            // 1. Canais
            const canaisSelecionados = fields.getSelectedChannels("canal");
            const canalDestino = canaisSelecionados ? canaisSelecionados.first() as SendableChannels : null;

            if (!canalDestino) {
                await interaction.followUp({ flags: ["Ephemeral"], content: "❌ Erro: Nenhum canal selecionado." });
                return;
            }

            let mensagemTexto = fields.getTextInputValue("mensagem");
            
            // Pega o valor da menção manual
            const mencaoManual = fields.getTextInputValue("mencao_manual");

            // 2. Imagem (Download Local Seguro)
            const imagens = fields.getUploadedFiles("imagem");
            const imagemAnexada = imagens?.first();
            let caminhoImagemLocal = "";

            if (imagemAnexada) {
                try {
                    console.log(`[Post Semanal] Baixando imagem: ${imagemAnexada.url}`);
                    const timestamp = Date.now();
                    const extensao = path.extname(imagemAnexada.name) || '.png';
                    const nomeArquivo = `post_semanal_${timestamp}${extensao}`;
                    const caminhoCompleto = path.join(IMAGE_DIR, nomeArquivo);

                    const response = await axios.get(imagemAnexada.url, { responseType: 'stream' });
                    await pipeline(response.data, fs.createWriteStream(caminhoCompleto));

                    caminhoImagemLocal = caminhoCompleto;
                    console.log(`[Post Semanal] Imagem salva em: ${caminhoImagemLocal}`);
                } catch (e) {
                    console.error("[Post Semanal] Erro ao baixar imagem:", e);
                }
            }

            // --- LÓGICA DE MENÇÃO ---
            
            // Se o usuário digitou algo manualmente, usamos isso e ignoramos o scraping
            if (mencaoManual && mencaoManual.trim().length > 0) {
                console.log(`[DEBUG] Menção manual detectada: ${mencaoManual}. Pulando scraping.`);
                mensagemTexto += `\n\n${mencaoManual}`;
            } 
            else {
                // SE NÃO TEM MENÇÃO MANUAL, RODA O SCRAPING (Lógica original intacta)
                console.log(`--- [DEBUG] INICIANDO SCRAPING EM: ${FLARESOLVERR_API} ---`);
                
                const sessionID = `sessao_${Date.now()}`;
                let html = "";
                let sucessoScraping = false;

                try {
                    await axios.post(FLARESOLVERR_API, { cmd: 'sessions.create', session: sessionID });

                    for (let tentativa = 1; tentativa <= 10; tentativa++) {
                        console.log(`[DEBUG] Tentativa ${tentativa}/10 buscando site...`);
                        try {
                            const response = await axios.post(FLARESOLVERR_API, {
                                cmd: 'request.get',
                                url: "https://sandwiche.me/sirius",
                                maxTimeout: 60000, 
                                session: sessionID
                            });

                            if (response.data.status === 'ok') {
                                html = response.data.solution.response;
                                if (html.length > 30000) {
                                    sucessoScraping = true;
                                    break; 
                                }
                            }
                        } catch (reqErr) {
                            console.warn(`[DEBUG] Erro na requisição: ${(reqErr as Error).message}`);
                        }
                        if (tentativa < 10) await new Promise(r => setTimeout(r, 8000));
                    }

                    if (!sucessoScraping) {
                        console.error("❌ Falha no scraping do Sandwiche. Enviando sem menções automáticas.");
                    } else {
                        const $ = cheerio.load(html);
                        const nomesObrasUnicos = new Set<string>();
                        let elementosEncontrados = $(".text-link-button-text-color");

                        if (elementosEncontrados.length === 0) {
                            $("p, span, div, a").each((_, el) => {
                                const txt = $(el).text().trim();
                                const match = txt.match(/^(.*?)\s*\(\d+(?:\.\d+)?\)$/);
                                if (match && match[1]) {
                                    const nomeLimpo = match[1].trim();
                                    if (nomeLimpo.length > 2) nomesObrasUnicos.add(nomeLimpo);
                                }
                            });
                        } else {
                            elementosEncontrados.each((i, element) => {
                                const textoCompleto = $(element).text().trim();
                                const match = textoCompleto.match(/^(.*?)\s*\(\d+(?:\.\d+)?\)$/);
                                if (match && match[1]) {
                                    const nomeLimpo = match[1].trim();
                                    if (nomeLimpo.length > 2) nomesObrasUnicos.add(nomeLimpo);
                                }
                            });
                        }

                        const mencoesParaAdicionar: string[] = [];
                        const guildRoles = interaction.guild.roles.cache;

                        for (const nomeObra of nomesObrasUnicos) {
                            const role = guildRoles.find(r => r.name.toLowerCase() === nomeObra.toLowerCase());
                            if (role) {
                                mencoesParaAdicionar.push(role.toString());
                            }
                        }

                        if (mencoesParaAdicionar.length > 0) {
                            mensagemTexto += `\n\n${mencoesParaAdicionar.join(" ")}`;
                        }
                    }

                } catch (err) {
                    console.error("[DEBUG] ERRO NO PROCESSO DE SCRAPING:", err);
                    await interaction.followUp({ content: "❌ Erro ao procurar cargos no Sandwiche, por favor tente novamente" });
                    return; 
                } finally {
                    await axios.post(FLARESOLVERR_API, { cmd: 'sessions.destroy', session: sessionID }).catch(() => {});
                }
                console.log("--- [DEBUG] FIM SCRAPING ---");
            }

            // 4. Tratamento de @Cargo no texto (Funciona tanto pra msg normal quanto pra menção manual)
            interaction.guild.roles.cache.forEach(cargo => {
                const nomeCargoSafe = cargo.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`@${nomeCargoSafe}`, 'gi');
                
                if (regex.test(mensagemTexto)) {
                    mensagemTexto = mensagemTexto.replace(regex, cargo.toString());
                }
            });

            // 5. Envio Final
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Sandwiche')
                        .setEmoji('🥪')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://sandwiche.me/sirius')
                );

            const payload: any = {
                content: mensagemTexto,
                components: [row]
            };

            if (caminhoImagemLocal) {
                payload.files = [caminhoImagemLocal];
            }

            await canalDestino.send(payload);

            await interaction.followUp({ 
                content: `✅ Post enviado com sucesso no canal ${canalDestino}!` 
            });

        } catch (error) {
            console.error(error);
            await interaction.followUp({ 
                content: `❌ Erro fatal: ${(error as Error).message}` 
            }).catch(() => {});
        }
    }
});