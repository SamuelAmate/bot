import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Message, TextChannel } from 'discord.js';
import fs from 'fs';
import { buscarLinkNaObra, verificarSeSaiuNoMangaPark, verificarSeSaiuNoSakura } from '../utils/Scraper.js';
import { addManga, getMangas, limparDuplicatas, MangaEntry } from '../utils/StateManager.js';

// Utilitário para pausa
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- CONFIGURAÇÃO DE PARALELISMO ---
// Quantas obras verificar SIMULTANEAMENTE. 
// 3 é seguro. 5 se tiver um PC bom. Mais que isso arrisca travar.
const CONCURRENCY_LIMIT = 3; 

export async function monitorMangas(bot: Client): Promise<void> {
    limparDuplicatas();
    const mangas = getMangas();
    
    console.log(`[Monitor] Iniciando ciclo para ${mangas.length} obras (Lotes de ${CONCURRENCY_LIMIT})...`);

    // Loop para processar em lotes (Chunks)
    for (let i = 0; i < mangas.length; i += CONCURRENCY_LIMIT) {
        const lote = mangas.slice(i, i + CONCURRENCY_LIMIT);
        console.log(`[Monitor] 🔄 Processando lote ${Math.floor(i / CONCURRENCY_LIMIT) + 1}...`);

        // Promise.all faz o array de promessas rodar ao mesmo tempo e espera todas acabarem
        await Promise.all(lote.map(manga => processarMangaUnico(bot, manga)));
    }

    console.log(`[Monitor] ✅ Ciclo de verificação finalizado.`);
}

// --- FUNÇÃO ISOLADA: Processa UMA obra ---
async function processarMangaUnico(bot: Client, manga: MangaEntry) {
    try {
        // --- VERIFICAÇÃO PARALELA (Sakura E MangaPark) ---
        const [statusSakura, statusMP] = await Promise.all([
            verificarSeSaiuNoSakura(manga.urlBase, manga.lastChapter),
            manga.urlMangapark ? verificarSeSaiuNoMangaPark(manga.urlMangapark, manga.lastChapter) : Promise.resolve({ saiu: false, numero: 0, link: "", titulo: null })
        ]);

        let novoCapitulo = 0;
        let detectouNovo = false;

        // Define qual é o novo capítulo (pega o maior se ambos saíram, ou o que saiu)
        if (statusSakura.saiu) {
            novoCapitulo = statusSakura.numero;
            detectouNovo = true;
        } else if (statusMP.saiu) {
            novoCapitulo = statusMP.numero;
            detectouNovo = true;
        }

        if (detectouNovo && novoCapitulo > manga.lastChapter) {
            console.log(`[Monitor] 🚨 Novo Capítulo Detectado: ${manga.titulo} - Cap ${novoCapitulo}`);
            
            // Lógica de URLs e Banco
            const novaURLSakuraBase = statusSakura.saiu 
                ? statusSakura.novaUrl 
                : construirUrlSakuraTeorica(manga.urlBase, novoCapitulo);
            
            const linkSakuraInicial = statusSakura.saiu ? statusSakura.novaUrl : null;
            const linkMPInicial = statusMP.saiu ? statusMP.link : null;
            const tituloCap = statusMP.titulo || null;

            const updatedManga: MangaEntry = {
                ...manga,
                lastChapter: novoCapitulo,
                urlBase: novaURLSakuraBase
            };
            addManga(updatedManga);

            // Inicia notificação (sem await para não travar o lote atual)
            gerenciarNotificacaoBilateral(
                bot, 
                updatedManga, 
                novoCapitulo, 
                linkSakuraInicial, 
                linkMPInicial, 
                tituloCap
            );
        }

    } catch (err) {
        console.error(`[Monitor] Erro processando ${manga.titulo}:`, err);
    }
}

// --- FUNÇÃO AUXILIAR: Constrói URL do Sakura baseada em lógica padrão ---
function construirUrlSakuraTeorica(urlBaseAntiga: string, novoCap: number): string {
    const numeroFormatado = novoCap.toString().replace('.', '-');
    const match = urlBaseAntiga.match(/(\d+(?:[-]\d+)?)\/?$/);
    if (match) {
        return urlBaseAntiga.replace(match[1], numeroFormatado);
    }
    return `${urlBaseAntiga.replace(/\/+$/, "")}/${numeroFormatado}/`;
}


// --- LÓGICA BILATERAL DE RETRY ---
async function gerenciarNotificacaoBilateral(
    bot: Client, 
    manga: MangaEntry, 
    capitulo: number, 
    linkSakuraJaEncontrado: string | null,
    linkMPJaEncontrado: string | null,
    tituloCapitulo: string | null
) {
    console.log(`[Notificação] Iniciando processo para ${manga.titulo} (Cap ${capitulo})`);

    let linkSakuraFinal = linkSakuraJaEncontrado;
    let linkMPFinal = linkMPJaEncontrado;
    let linkMPTitulo = tituloCapitulo;

    if (linkSakuraFinal && linkMPFinal) {
        await enviarMensagemFinal(bot, manga, capitulo, linkSakuraFinal, linkMPFinal, linkMPTitulo, false);
        return;
    }

    // MODO DE ESPERA (RETRY)
    console.log(`[Notificação] ⏳ Faltam links para ${manga.titulo}. Aguardando 10 minutos...`);
    await sleep(10 * 60 * 1000); 

    console.log(`[Notificação] 🔎 Tentativa 2 para ${manga.titulo}...`);
    
    if (!linkSakuraFinal) {
        const resSakura = await verificarSeSaiuNoSakura(manga.urlBase, capitulo);
        if (resSakura.saiu) linkSakuraFinal = resSakura.novaUrl;
    }
    if (!linkMPFinal && manga.urlMangapark) {
        const resMP = await buscarLinkNaObra(manga.urlMangapark, capitulo);
        if (resMP.link !== manga.urlMangapark) {
            linkMPFinal = resMP.link;
            linkMPTitulo = resMP.titulo;
        }
    }

    if (linkSakuraFinal && linkMPFinal) {
        await enviarMensagemFinal(bot, manga, capitulo, linkSakuraFinal, linkMPFinal, linkMPTitulo, false);
        return;
    }

    // ENVIO COM LINK GENÉRICO
    console.log(`[Notificação] ⚠️ ${manga.titulo} incompleto. Enviando genéricos.`);
    
    const linkSakuraParaEnvio = linkSakuraFinal || manga.urlBase;
    const linkMPParaEnvio = linkMPFinal || manga.urlMangapark || `https://mangapark.net/search?q=${encodeURIComponent(manga.titulo)}`;
    const usouGenerico = !linkSakuraFinal || !linkMPFinal;

    const mensagemEnviada = await enviarMensagemFinal(
        bot, manga, capitulo, linkSakuraParaEnvio, linkMPParaEnvio, linkMPTitulo, usouGenerico
    );

    if (!mensagemEnviada || !usouGenerico) return; 

    // TENTATIVA FINAL (EDIÇÃO)
    console.log(`[Notificação] Aguardando mais 10 minutos para edição (${manga.titulo})...`);
    await sleep(10 * 60 * 1000); 

    console.log(`[Notificação] 🔎 Tentativa 3 (Edição) para ${manga.titulo}...`);
    let houveMelhoria = false;

    if (!linkSakuraFinal) {
        const resSakura = await verificarSeSaiuNoSakura(manga.urlBase, capitulo);
        if (resSakura.saiu) {
            linkSakuraFinal = resSakura.novaUrl;
            houveMelhoria = true;
        }
    }
    if (!linkMPFinal && manga.urlMangapark) {
        const resMP = await buscarLinkNaObra(manga.urlMangapark, capitulo);
        if (resMP.link !== manga.urlMangapark) {
            linkMPFinal = resMP.link;
            houveMelhoria = true;
        }
    }

    if (houveMelhoria) {
        console.log(`[Notificação] ✨ Links encontrados para ${manga.titulo}! Editando.`);
        const novoLinkSakura = linkSakuraFinal || linkSakuraParaEnvio;
        const novoLinkMP = linkMPFinal || linkMPParaEnvio;
        
        try {
            const novaRow = construirBotoes(novoLinkSakura, novoLinkMP, manga.urlMangataro);
            await mensagemEnviada.edit({ components: [novaRow] });
        } catch (error) {
            console.error(`[Notificação] Falha ao editar mensagem:`, error);
        }
    }
}

// --- HELPER: Construtor de Botões ---
function construirBotoes(linkSakura: string, linkMP: string, linkMangataro?: string): ActionRowBuilder<ButtonBuilder> {
    const buttons: ButtonBuilder[] = [];

    const isGenericSakura = !/\d+(-?\d+)?\/?$/.test(linkSakura); 
    buttons.push(
        new ButtonBuilder()
            .setLabel(isGenericSakura ? 'Ler no Sakura' : 'Ler no Sakura')
            .setEmoji('🌸')
            .setStyle(ButtonStyle.Link)
            .setURL(linkSakura)
    );

    if (linkMP && linkMP.startsWith('http')) {
        const isGenericMP = !linkMP.includes('chapter') && !linkMP.includes('ch.') && !/\d$/.test(linkMP);
        const emoji = isGenericMP ? '🏠' : '🎢'; 
        const label = isGenericMP ? 'Ler no Mangapark' : 'Ler no Mangapark';

        buttons.push(new ButtonBuilder().setLabel(label).setEmoji(emoji).setStyle(ButtonStyle.Link).setURL(linkMP));
    }

    if (linkMangataro && linkMangataro.startsWith('http')) {
        buttons.push(new ButtonBuilder().setLabel('Ler no MangaTaro').setEmoji('🎴').setStyle(ButtonStyle.Link).setURL(linkMangataro));
    }

    return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

// --- HELPER: Envio de Mensagem ---
async function enviarMensagemFinal(
    bot: Client, 
    manga: MangaEntry, 
    capitulo: number, 
    linkSakura: string, 
    linkMP: string, 
    tituloCapitulo: string | null,
    ehLinkGenerico: boolean
): Promise<Message | null> {
    
    let mensagemFinal = manga.mensagemPadrao || "O **capítulo {capitulo}** de @{titulo}, **\"{nome_capitulo}\",** já está disponível.\n\n*Aproveitem e boa leitura!*";

    const temTituloReal = tituloCapitulo && tituloCapitulo.trim() !== "" && !/^cap[íi]tulo\s*\d+$/i.test(tituloCapitulo);

    if (temTituloReal) {
        mensagemFinal = mensagemFinal.replace(/{nome_capitulo}/g, tituloCapitulo!);
    } else {
        mensagemFinal = mensagemFinal.replace(/, \*\*"{nome_capitulo}"\*\*/g, "").replace(/{nome_capitulo}/g, "");
    }

    mensagemFinal = mensagemFinal
        .replace(/{capitulo}/g, capitulo.toString())
        .replace(/{titulo}/g, manga.titulo)
        .replace(/{link_sakura}/g, '')
        .replace(/{link_mangapark}/g, '')
        .replace(/{link_mangataro}/g, '')
        .replace(/🌸 \*\*Sakura:\*\*/g, '')
        .replace(/🎢\*\*Mangapark:\*\*/g, '')
        .replace(/🎴 \*\*MangaTaro:\*\*/g, '')
        .replace(/[ \t]{2,}/g, " ").replace(/ ,/g, ",");

    const row = construirBotoes(linkSakura, linkMP, manga.urlMangataro);

    try {
        const channel = await bot.channels.fetch(manga.channelId);
        if (channel && channel.isTextBased()) {
            if ('guild' in channel) {
                const guild = (channel as TextChannel).guild;
                const role = guild.roles.cache.find((r: any) => r.name.toLowerCase() === manga.titulo.toLowerCase());
                if (role) {
                    mensagemFinal = mensagemFinal.replace(`@${manga.titulo}`, role.toString());
                }
            }

            const payload: any = { content: mensagemFinal.trim(), components: [row] };

            if (manga.imagem) {
                if (manga.imagem.startsWith('http')) {
                    const embed = new EmbedBuilder().setColor(0x2b2d31).setImage(manga.imagem);
                    payload.embeds = [embed];
                } else if (fs.existsSync(manga.imagem)) {
                    payload.files = [manga.imagem];
                }
            }

            const msgEnviada = await (channel as TextChannel).send(payload);
            console.log(`[Monitor] Notificação enviada para ${manga.titulo}`);
            return msgEnviada;
        }
    } catch (error: any) {
        if (error.code === 50001) {
            console.error(`❌ [Monitor] ERRO DE PERMISSÃO: O bot não consegue postar no canal ${manga.channelId}.`);
        } else {
            console.error(`[Monitor] Erro envio Discord:`, error);
        }
    }
    return null;
}