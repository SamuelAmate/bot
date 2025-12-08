import { createResponder, ResponderType } from "#base";
import axios from "axios";
import * as cheerio from "cheerio";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SendableChannels } from "discord.js";

// URL do seu FlareSolverr (mesma que você usa no scraper)
const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1';

createResponder({
    customId: "enviar-post-semanal",
    types: [ResponderType.Modal],
    cache: "cached",
    async run(interaction): Promise<void> {
        if (!interaction.isModalSubmit() || !interaction.guild) return;

        // Defer Update é crucial aqui pois o FlareSolverr pode demorar uns segundos
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

            // 2. Imagem (Backup)
            const imagens = fields.getUploadedFiles("imagem");
            const imagemAnexada = imagens?.first();
            let urlImagemFinal = "";
            const canalAtual = interaction.channel as SendableChannels;

            if (imagemAnexada) {
                try {
                    const msgBackup = await canalAtual.send({
                        content: `📦 **Backup Post Semanal** (Não apague)`,
                        files: [imagemAnexada.url] 
                    });
                    urlImagemFinal = msgBackup?.attachments.first()?.url || imagemAnexada.url;
                } catch (e) { 
                    urlImagemFinal = imagemAnexada.url; 
                }
            }

            // --- 3. SCRAPING ROBUSTO (COM RETRY) ---
            console.log("--- [DEBUG] INICIANDO SCRAPING VIA FLARESOLVERR ---");
            
            // Criamos uma sessão para manter o navegador aberto entre tentativas
            const sessionID = `sessao_${Date.now()}`;
            let html = "";
            let sucessoScraping = false;

            try {
                // Cria sessão
                await axios.post(FLARESOLVERR_URL, { cmd: 'sessions.create', session: sessionID });

                // Tenta até 5 vezes se o HTML vier incompleto
                for (let tentativa = 1; tentativa <= 5; tentativa++) {
                    console.log(`[DEBUG] Tentativa ${tentativa}/5 buscando site...`);

                    const response = await axios.post(FLARESOLVERR_URL, {
                        cmd: 'request.get',
                        url: "https://sandwiche.me/sirius",
                        maxTimeout: 60000, 
                        session: sessionID
                    });

                    if (response.data.status === 'ok') {
                        html = response.data.solution.response;
                        
                        // Validação: Se o HTML for muito pequeno (< 30k), é só a tela de loading.
                        // O site carregado corretamente tem +50k caracteres.
                        if (html.length > 30000) {
                            console.log(`[DEBUG] Sucesso! Site carregado (${html.length} chars).`);
                            sucessoScraping = true;
                            break; 
                        } else {
                            console.warn(`[DEBUG] Site incompleto (${html.length} chars). Aguardando...`);
                        }
                    }

                    // Espera 3s antes da próxima tentativa
                    if (tentativa < 3) await new Promise(r => setTimeout(r, 3000));
                }

                if (!sucessoScraping) {
                    console.error("❌ Falha: O site não carregou completamente após 3 tentativas.");
                } else {
                    // PROCESSAMENTO DO HTML
                    const $ = cheerio.load(html);
                    const nomesObrasUnicos = new Set<string>();

                    let elementosEncontrados = $(".text-link-button-text-color");

                    // Fallback
                    if (elementosEncontrados.length === 0) {
                        console.log("[DEBUG] Busca padrão falhou, tentando busca ampla...");
                        $("p, span, div, a").each((_, el) => {
                            const txt = $(el).text().trim();
                            if (txt.match(/^.+\(\d+(\.\d+)?\)$/)) {
                                elementosEncontrados = elementosEncontrados.add(el); 
                            }
                        });
                    }

                    console.log(`[DEBUG] Elementos encontrados: ${elementosEncontrados.length}`);

                    elementosEncontrados.each((i, element) => {
                        const textoCompleto = $(element).text().trim();
                        // Regex: Pega nome antes do parenteses ex: "Obra (10)"
                        const match = textoCompleto.match(/^(.*?)\s*\(\d+(?:\.\d+)?\)$/);

                        if (match && match[1]) {
                            const nomeLimpo = match[1].trim();
                            if (nomeLimpo.length > 2 && !nomesObrasUnicos.has(nomeLimpo)) {
                                nomesObrasUnicos.add(nomeLimpo);
                                console.log(`[DEBUG] Obra: "${nomeLimpo}"`);
                            }
                        }
                    });

                    // Comparação com Cargos
                    const mencoesParaAdicionar: string[] = [];
                    const guildRoles = interaction.guild.roles.cache;

                    for (const nomeObra of nomesObrasUnicos) {
                        const role = guildRoles.find(r => r.name.toLowerCase() === nomeObra.toLowerCase());
                        if (role) {
                            console.log(`[DEBUG] Cargo vinculado: ${role.name}`);
                            mencoesParaAdicionar.push(role.toString());
                        }
                    }

                    if (mencoesParaAdicionar.length > 0) {
                        mensagemTexto += `\n\n${mencoesParaAdicionar.join(" ")}`;
                    }
                }

            } catch (err) {
                console.error("[DEBUG] ERRO NO SCRAPING:", err);
            } finally {
                // Limpa a sessão para não pesar a memória
                await axios.post(FLARESOLVERR_URL, { cmd: 'sessions.destroy', session: sessionID }).catch(() => {});
            }
            console.log("--- [DEBUG] FIM ---");

            // 4. Menção Manual (@Cargo no texto)
            interaction.guild.roles.cache.forEach(cargo => {
                const regex = new RegExp(`@${cargo.name}`, 'gi');
                if (regex.test(mensagemTexto)) {
                    mensagemTexto = mensagemTexto.replace(regex, cargo.toString());
                }
            });

            // 5. Envio
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

            if (urlImagemFinal) {
                payload.files = [urlImagemFinal];
            }

            await canalDestino.send(payload);

            await interaction.followUp({ 
                content: `✅ Post enviado com sucesso no canal ${canalDestino}!` 
            });

        } catch (error) {
            console.error(error);
            await interaction.followUp({ 
                content: `❌ Erro: ${(error as Error).message}` 
            }).catch(() => {});
        }
    }
});