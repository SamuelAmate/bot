import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buscarLinkNaObra, verificarSeSaiuNoSakura } from '../utils/Scraper.js';
import { addManga, getMangas, limparDuplicatas, MangaEntry } from '../utils/StateManager.js';

export async function monitorMangas(bot: any): Promise<void> {
    
    limparDuplicatas();
    const mangas = getMangas();

    for (const manga of mangas) {
        try {
            const statusSakura = await verificarSeSaiuNoSakura(manga.urlBase, manga.lastChapter); 

            if (statusSakura.saiu) {
                const novoCapitulo = statusSakura.numero;
                console.log(`[Monitor] Novo capítulo encontrado para ${manga.titulo}: ${novoCapitulo}`);

                const novaURLCapitulo = statusSakura.novaUrl; 
                let nomeCapituloExtraido: string | null = null;

                // --- 1. MANGAPARK ---
                let linkFinalMangapark = "";
                if (manga.urlMangapark) {
                    const resultado = await buscarLinkNaObra(manga.urlMangapark, novoCapitulo);
                    linkFinalMangapark = resultado.link;
                    if (resultado.titulo) nomeCapituloExtraido = resultado.titulo;
                } else {
                    linkFinalMangapark = `https://mangapark.net/search?q=${encodeURIComponent(manga.titulo)}`;
                }

                // --- 2. MANGATARO (CORREÇÃO AQUI) ---
                // Removemos as aspas para pegar o valor real do JSON
                let urlMangataroFinal = manga.urlMangataro; 

                // --- BOTÕES (LÓGICA SEGURA) ---
                // Criamos um array de botões e só adicionamos os que têm links válidos
                const buttons: ButtonBuilder[] = [];

                // Botão 1: Sakura (Sempre existe se entrou aqui)
                buttons.push(
                    new ButtonBuilder()
                        .setLabel('Ler no Sakura')
                        .setEmoji('🌸') 
                        .setStyle(ButtonStyle.Link) 
                        .setURL(novaURLCapitulo)
                );

                // Botão 2: MangaPark (Verifica se é link válido)
                if (linkFinalMangapark && linkFinalMangapark.startsWith('http')) {
                    buttons.push(
                        new ButtonBuilder()
                            .setLabel('Mangapark')
                            .setEmoji('🎢')
                            .setStyle(ButtonStyle.Link)
                            .setURL(linkFinalMangapark)
                    );
                }

                // Botão 3: MangaTaro (Verifica se existe no JSON e se é link válido)
                if (urlMangataroFinal && urlMangataroFinal.startsWith('http')) {
                    buttons.push(
                        new ButtonBuilder()
                            .setLabel('MangaTaro')
                            .setEmoji('🎴')
                            .setStyle(ButtonStyle.Link)
                            .setURL(urlMangataroFinal)
                    );
                }

                // Cria a Row apenas com os botões válidos
                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

                // --- MENSAGEM ---
                let mensagemFinal = manga.mensagemPadrao || "O **capítulo {capitulo}** de @{titulo}, **\"{nome_capitulo}\"** já está disponível.\n\n*aproveitem e boa leitura.*";

                // Validação do Título
                const temTituloReal = nomeCapituloExtraido && 
                                    nomeCapituloExtraido.trim() !== "" && 
                                    !/^cap[íi]tulo\s*\d+$/i.test(nomeCapituloExtraido);

                if (temTituloReal) {
                    mensagemFinal = mensagemFinal.replace(/{nome_capitulo}/g, nomeCapituloExtraido!);
                } else {
                    // SE NÃO TIVER TÍTULO:
                    mensagemFinal = mensagemFinal.replace(/, \*\*"{nome_capitulo}"\*\*/g, "");
                    mensagemFinal = mensagemFinal.replace(/{nome_capitulo}/g, "");
                }

                // Substituições Finais
                mensagemFinal = mensagemFinal
                    .replace(/{capitulo}/g, novoCapitulo.toString())
                    .replace(/{titulo}/g, manga.titulo)
                    .replace(/{link_sakura}/g, '') 
                    .replace(/{link_mangapark}/g, '')
                    .replace(/{link_mangataro}/g, '')
                    .replace(/🌸 \*\*Sakura:\*\*/g, '')
                    .replace(/🎢\*\*Mangapark:\*\*/g, '')
                    .replace(/🎴 \*\*MangaTaro:\*\*/g, '');
                
                // Limpeza de espaços duplos
                mensagemFinal = mensagemFinal.replace(/[ \t]{2,}/g, " ").replace(/ ,/g, ",");

                // Envio
                try {
                    const channel = await bot.channels.fetch(manga.channelId);
                    if (channel && channel.isTextBased()) {
                        
                        if ('guild' in channel) {
                            const guild = channel.guild;
                            const role = guild.roles.cache.find((r: any) => r.name.toLowerCase() === manga.titulo.toLowerCase());
                            if (role) {
                                mensagemFinal = mensagemFinal.replace(`@${manga.titulo}`, role.toString());
                            }
                        }

                        const payload: any = { 
                            content: mensagemFinal.trim(),
                            components: [row] 
                        };

                        if (manga.imagem) {
                            payload.files = [manga.imagem];
                        }

                        await channel.send(payload);
                        console.log(`[Monitor] Mensagem enviada!`);
                    }
                } catch (error) {
                    console.error(`[Monitor] Erro envio Discord:`, error);
                }

                // ATUALIZAÇÃO DO BANCO
                const updatedManga: MangaEntry = {
                    ...manga,
                    lastChapter: novoCapitulo,
                    urlBase: novaURLCapitulo 
                };
                
                addManga(updatedManga);
                console.log(`[Monitor] Banco atualizado: ${manga.titulo} agora está no Cap ${novoCapitulo}`);
            }
        } catch (err) {
            console.error(`[Monitor] Erro processando ${manga.titulo}:`, err);
        }
    }
}