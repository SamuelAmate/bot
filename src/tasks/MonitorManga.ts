import { getMangas, addManga, MangaEntry } from '../utils/StateManager.js';
import { getLatestChapter } from '../utils/Scraper.js'; 

export async function monitorMangas(bot: any): Promise<void> {
    const mangas = getMangas();

    for (const manga of mangas) {
        
        const latestChapter = await getLatestChapter(manga.urlBase, manga.lastChapter); 

        if (latestChapter > manga.lastChapter) {
            
            const novaURLCapitulo = `${manga.urlBase}${latestChapter}/`;
            
            // 1. Notificar o canal do Discord
            try {
                const channel = await bot.channels.fetch(manga.channelId);
                if (channel && channel.isTextBased()) {
                    await channel.send(`🚨 **NOVO CAPÍTULO DISPONÍVEL!** ${manga.titulo}
Capítulo **${latestChapter}**! 🔥
${novaURLCapitulo}`);
                }
            } catch (error) {
                console.error(`Erro ao enviar notificação para ${manga.urlBase}:`, error);
            }

            // 2. Atualizar o estado
            const updatedManga: MangaEntry = {
                ...manga,
                lastChapter: latestChapter
            };
            addManga(updatedManga);
        }
    }
}