import { createResponder, ResponderType } from "#base";
import axios from "axios";
import * as cheerio from "cheerio";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SendableChannels } from "discord.js";
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

// --- CONFIGURAÇÃO ROBUSTA DA URL DO FLARESOLVERR ---
// Pega a URL base e garante que termine com /v1
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

        // Defer Update é crucial aqui pois o FlareSolverr pode demorar
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

            // 2. Imagem (Download Local Seguro)
            const imagens = fields.getUploadedFiles("imagem");
            const imagemAnexada = imagens?.first();
            let caminhoImagemLocal = "";

            if (imagemAnexada) {
                try {
                    console.log(`[Post Semanal] Baixando imagem: ${imagemAnexada.url}`);
                    
                    // Gera nome único para o arquivo temporário do post semanal
                    const timestamp = Date.now();
                    const extensao = path.extname(imagemAnexada.name) || '.png';
                    const nomeArquivo = `post_semanal_${timestamp}${extensao}`;
                    const caminhoCompleto = path.join(IMAGE_DIR, nomeArquivo);

                    // Download
                    const response = await axios.get(imagemAnexada.url, { responseType: 'stream' });
                    await pipeline(response.data, fs.createWriteStream(caminhoCompleto));

                    caminhoImagemLocal = caminhoCompleto;
                    console.log(`[Post Semanal] Imagem salva em: ${caminhoImagemLocal}`);

                } catch (e) {
                    console.error("[Post Semanal] Erro ao baixar imagem:", e);
                    // Segue sem imagem se der erro
                }
            }

            // --- 3. SCRAPING ROBUSTO ---
            console.log(`--- [DEBUG] INICIANDO SCRAPING EM: ${FLARESOLVERR_API} ---`);
            
            const sessionID = `sessao_${Date.now()}`;
            let html = "";
            let sucessoScraping = false;

            try {
                // Cria sessão
                await axios.post(FLARESOLVERR_API, { cmd: 'sessions.create', session: sessionID });

                // Tenta até 3 vezes (reduzi para 3 para ser mais ágil)
                for (let tentativa = 1; tentativa <= 3; tentativa++) {
                    console.log(`[DEBUG] Tentativa ${tentativa}/3 buscando site...`);

                    try {
                        const response = await axios.post(FLARESOLVERR_API, {
                            cmd: 'request.get',
                            url: "https://sandwiche.me/sirius",
                            maxTimeout: 60000, 
                            session: sessionID
                        });

                        if (response.data.status === 'ok') {
                            html = response.data.solution.response;
                            
                            // Validação de tamanho
                            if (html.length > 30000) {
                                console.log(`[DEBUG] Sucesso! Site carregado (${html.length} chars).`);
                                sucessoScraping = true;
                                break; 
                            } else {
                                console.warn(`[DEBUG] Site incompleto (${html.length} chars).`);
                            }
                        }
                    } catch (reqErr) {
                        console.warn(`[DEBUG] Erro na requisição: ${(reqErr as Error).message}`);
                    }

                    // Espera 3s
                    if (tentativa < 3) await new Promise(r => setTimeout(r, 3000));
                }

                if (!sucessoScraping) {
                    console.error("❌ Falha no scraping do Sandwiche. Enviando sem menções automáticas.");
                } else {
                    // PROCESSAMENTO DO HTML (CHEERIO)
                    const $ = cheerio.load(html);
                    const nomesObrasUnicos = new Set<string>();

                    let elementosEncontrados = $(".text-link-button-text-color");

                    // Fallback de busca
                    if (elementosEncontrados.length === 0) {
                        console.log("[DEBUG] Busca padrão falhou, tentando busca ampla...");
                        $("p, span, div, a").each((_, el) => {
                            const txt = $(el).text().trim();
                            if (txt.match(/^.+\(\d+(\.\d+)?\)$/)) {
                                // Adiciona o elemento ao conjunto do Cheerio
                                // Nota: Cheerio não tem .add() direto em listas node, então recriamos
                                // Para simplificar, vamos processar direto aqui se cair no fallback
                                const match = txt.match(/^(.*?)\s*\(\d+(?:\.\d+)?\)$/);
                                if (match && match[1]) {
                                    const nomeLimpo = match[1].trim();
                                    if (nomeLimpo.length > 2) nomesObrasUnicos.add(nomeLimpo);
                                }
                            }
                        });
                    } else {
                        // Processamento padrão
                        elementosEncontrados.each((i, element) => {
                            const textoCompleto = $(element).text().trim();
                            const match = textoCompleto.match(/^(.*?)\s*\(\d+(?:\.\d+)?\)$/);

                            if (match && match[1]) {
                                const nomeLimpo = match[1].trim();
                                if (nomeLimpo.length > 2) {
                                    nomesObrasUnicos.add(nomeLimpo);
                                }
                            }
                        });
                    }

                    console.log(`[DEBUG] Obras encontradas: ${Array.from(nomesObrasUnicos).join(', ')}`);

                    // Comparação com Cargos
                    const mencoesParaAdicionar: string[] = [];
                    const guildRoles = interaction.guild.roles.cache;

                    for (const nomeObra of nomesObrasUnicos) {
                        // Busca case-insensitive
                        const role = guildRoles.find(r => r.name.toLowerCase() === nomeObra.toLowerCase());
                        if (role) {
                            mencoesParaAdicionar.push(role.toString());
                        }
                    }

                    if (mencoesParaAdicionar.length > 0) {
                        // Adiciona as menções ao final da mensagem
                        mensagemTexto += `\n\n${mencoesParaAdicionar.join(" ")}`;
                    }
                }

            } catch (err) {
                console.error("[DEBUG] ERRO NO PROCESSO DE SCRAPING:", err);
            } finally {
                // Limpa a sessão
                await axios.post(FLARESOLVERR_API, { cmd: 'sessions.destroy', session: sessionID }).catch(() => {});
            }
            console.log("--- [DEBUG] FIM SCRAPING ---");

            // 4. Menção Manual (@Cargo no texto) - Caso o usuário tenha digitado manualmente
            interaction.guild.roles.cache.forEach(cargo => {
                // Escape para caracteres especiais no nome do cargo
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

            // Anexa o arquivo local se existir
            if (caminhoImagemLocal) {
                payload.files = [caminhoImagemLocal];
            }

            await canalDestino.send(payload);

            await interaction.followUp({ 
                content: `✅ Post enviado com sucesso no canal ${canalDestino}!` 
            });

            // Opcional: Limpar a imagem temporária depois de enviar (para economizar espaço)
            // Se você quiser manter um histórico, remova estas linhas:
            /*
            if (caminhoImagemLocal) {
                setTimeout(() => {
                    try { fs.unlinkSync(caminhoImagemLocal); } catch(e) {}
                }, 10000); // Deleta após 10 segundos
            }
            */

        } catch (error) {
            console.error(error);
            await interaction.followUp({ 
                content: `❌ Erro fatal: ${(error as Error).message}` 
            }).catch(() => {});
        }
    }
});