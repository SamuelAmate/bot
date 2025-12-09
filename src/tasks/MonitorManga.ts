import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Client, TextChannel, Message } from 'discord.js';
import fs from 'fs';
import { buscarLinkNaObra, verificarSeSaiuNoSakura } from '../utils/Scraper.js';
import { addManga, getMangas, limparDuplicatas, MangaEntry } from '../utils/StateManager.js';

// Utilitário para pausa (Promisified Timeout)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function monitorMangas(bot: Client): Promise<void> {
    limparDuplicatas();
    const mangas = getMangas();

    for (const manga of mangas) {
        try {
            const statusSakura = await verificarSeSaiuNoSakura(manga.urlBase, manga.lastChapter);

            if (statusSakura.saiu) {
                const novoCapitulo = statusSakura.numero;
                const novaURLSakura = statusSakura.novaUrl;
                
                console.log(`[Monitor] 🌸 Novo capítulo detectado no Sakura: ${manga.titulo} - Cap ${novoCapitulo}`);

                // 1. ATUALIZA O BANCO IMEDIATAMENTE 
                // Isso impede que o Cron pegue esse mesmo capítulo daqui a 10 min
                const updatedManga: MangaEntry = {
                    ...manga,
                    lastChapter: novoCapitulo,
                    urlBase: novaURLSakura
                };
                addManga(updatedManga);

                // 2. INICIA O PROCESSO DE BUSCA/ENVIO (Assíncrono)
                // Não usamos 'await' aqui para não travar o loop dos outros mangás
                gerenciarNotificacaoComRetry(bot, updatedManga, novoCapitulo, novaURLSakura);
            }
        } catch (err) {
            console.error(`[Monitor] Erro processando ${manga.titulo}:`, err);
        }
    }
}

// --- FUNÇÃO CORE: Gerencia a espera e as tentativas ---
async function gerenciarNotificacaoComRetry(
    bot: Client, 
    manga: MangaEntry, 
    capitulo: number, 
    urlSakura: string
) {
    console.log(`[Monitor] 🔎 Tentativa 1 (Imediata) para ${manga.titulo}...`);
    
    // TENTATIVA 1: Imediata
    let resultadoMP = await tentarAcharLinkMangaPark(manga, capitulo);

    if (resultadoMP.encontrou) {
        // Cenário Perfeito: Achou na hora
        await enviarMensagemFinal(bot, manga, capitulo, urlSakura, resultadoMP.link, resultadoMP.titulo, false);
        return;
    }

    // Se não achou, entra no modo de espera (Retry Logic)
    console.log(`[Monitor] ⏳ Link MP não encontrado para ${manga.titulo}. Aguardando 10 minutos...`);
    
    // ESPERA 1: 10 Minutos (600.000 ms)
    await sleep(10 * 60 * 1000); 

    console.log(`[Monitor] 🔎 Tentativa 2 (Após 10min) para ${manga.titulo}...`);
    resultadoMP = await tentarAcharLinkMangaPark(manga, capitulo);

    if (resultadoMP.encontrou) {
        // Cenário: Achou depois de 10 min
        await enviarMensagemFinal(bot, manga, capitulo, urlSakura, resultadoMP.link, resultadoMP.titulo, false);
        return;
    }

    // Se AINDA não achou, envia com link Genérico
    console.log(`[Monitor] ⚠️ Ainda não encontrado. Enviando link genérico e agendando verificação final.`);
    const linkGenerico = manga.urlMangapark || `https://mangapark.net/search?q=${encodeURIComponent(manga.titulo)}`;
    
    // Envia a mensagem com link genérico e guarda o objeto da mensagem
    const mensagemEnviada = await enviarMensagemFinal(bot, manga, capitulo, urlSakura, linkGenerico, null, true);

    if (!mensagemEnviada) return; // Se falhou ao enviar, aborta

    // ESPERA 2: Mais 10 Minutos
    console.log(`[Monitor] ⏳ Aguardando mais 10 minutos para tentar editar a mensagem...`);
    await sleep(10 * 60 * 1000);

    // TENTATIVA FINAL: Editar a mensagem
    console.log(`[Monitor] 🔎 Tentativa 3 (Final - Edição) para ${manga.titulo}...`);
    resultadoMP = await tentarAcharLinkMangaPark(manga, capitulo);

    if (resultadoMP.encontrou) {
        console.log(`[Monitor] ✨ Link encontrado! Editando mensagem antiga...`);
        try {
            // Reconstrói os botões com o novo link
            const novaRow = construirBotoes(urlSakura, resultadoMP.link, manga.urlMangataro);
            await mensagemEnviada.edit({ components: [novaRow] });
            console.log(`[Monitor] Mensagem editada com sucesso!`);
        } catch (error) {
            console.error(`[Monitor] Erro ao editar mensagem:`, error);
        }
    } else {
        console.log(`[Monitor] Link não encontrado na tentativa final. Mantendo link genérico.`);
    }
}

// --- HELPER: Busca no MangaPark ---
async function tentarAcharLinkMangaPark(manga: MangaEntry, capitulo: number) {
    if (manga.urlMangapark) {
        const res = await buscarLinkNaObra(manga.urlMangapark, capitulo);
        // Verifica se o link retornado é específico (contém 'chapter' ou similar e não é igual a URL base exata se ela for limpa)
        // A função buscarLinkNaObra já retorna o link base se não achar, então checamos se mudou algo
        if (res.link !== manga.urlMangapark && res.link.length > manga.urlMangapark.length) {
             return { encontrou: true, link: res.link, titulo: res.titulo };
        }
    }
    return { encontrou: false, link: "", titulo: null };
}

// --- HELPER: Construtor de Botões ---
function construirBotoes(linkSakura: string, linkMP: string, linkMangataro?: string): ActionRowBuilder<ButtonBuilder> {
    const buttons: ButtonBuilder[] = [];

    // Botão Sakura
    buttons.push(new ButtonBuilder().setLabel('Ler no Sakura').setEmoji('🌸').setStyle(ButtonStyle.Link).setURL(linkSakura));

    // Botão MangaPark
    if (linkMP && linkMP.startsWith('http')) {
        const isGeneric = !linkMP.includes('chapter') && !linkMP.includes('ch.'); // Detecção simples se é genérico
        const emoji = isGeneric ? '🏠' : '🎢'; // Casa se for home, Montanha Russa se for cap
        const label = isGeneric ? 'Ler no Mangapark' : 'Ler no Mangapark';

        buttons.push(new ButtonBuilder().setLabel(label).setEmoji(emoji).setStyle(ButtonStyle.Link).setURL(linkMP));
    }

    // Botão MangaTaro
    if (linkMangataro && linkMangataro.startsWith('http')) {
        buttons.push(new ButtonBuilder().setLabel('Ler no MangaTaro').setEmoji('🎴').setStyle(ButtonStyle.Link).setURL(linkMangataro));
    }

    return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

// --- HELPER: Envio de Mensagem (Centralizado) ---
async function enviarMensagemFinal(
    bot: Client, 
    manga: MangaEntry, 
    capitulo: number, 
    linkSakura: string, 
    linkMP: string, 
    tituloCapitulo: string | null,
    ehLinkGenerico: boolean
): Promise<Message | null> {
    
    // Preparar Texto
    let mensagemFinal = manga.mensagemPadrao || "O **capítulo {capitulo}** de @{titulo}, **\"{nome_capitulo}\"** já está disponível.\n\n*aproveitem e boa leitura.*";

    // Tratamento do nome do capítulo
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

    // Construir Botões
    const row = construirBotoes(linkSakura, linkMP, manga.urlMangataro);

    try {
        const channel = await bot.channels.fetch(manga.channelId);
        if (channel && channel.isTextBased()) {
            
            // Tratamento de Menção de Cargo
            if ('guild' in channel) {
                const guild = (channel as TextChannel).guild;
                const role = guild.roles.cache.find((r: any) => r.name.toLowerCase() === manga.titulo.toLowerCase());
                if (role) {
                    mensagemFinal = mensagemFinal.replace(`@${manga.titulo}`, role.toString());
                }
            }

            const payload: any = { content: mensagemFinal.trim(), components: [row] };

            // Tratamento de Imagem
            if (manga.imagem) {
                if (manga.imagem.startsWith('http')) {
                    const embed = new EmbedBuilder().setColor(0x2b2d31).setImage(manga.imagem);
                    payload.embeds = [embed];
                } else if (fs.existsSync(manga.imagem)) {
                    payload.files = [manga.imagem];
                }
            }

            const msgEnviada = await (channel as TextChannel).send(payload);
            console.log(`[Monitor] Mensagem enviada para ${manga.titulo} (Link Genérico: ${ehLinkGenerico})`);
            return msgEnviada;
        }
    } catch (error) {
        console.error(`[Monitor] Erro envio Discord:`, error);
    }
    return null;
}