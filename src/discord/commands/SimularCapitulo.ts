import { createCommand } from "#base";
import { ApplicationCommandType, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getMangas } from '../../utils/StateManager.js';

createCommand({
    name: "simular-novo-capitulo",
    description: "Gera uma prévia visual da mensagem de notificação.",
    type: ApplicationCommandType.ChatInput,
    options: [
        {
            name: "titulo",
            description: "O título da obra cadastrada.",
            type: 3, // STRING
            required: true
        }
    ],
    async run(interaction) {
        if (!interaction.isChatInputCommand() || !interaction.guild) return;

        // Apenas confirma para quem digitou que o processo iniciou (invisível para os outros)
        await interaction.deferReply({ ephemeral: true });

        const tituloParaSimular = interaction.options.getString("titulo", true);
        const mangas = getMangas();
        const manga = mangas.find(m => m.titulo?.toLowerCase() === tituloParaSimular.toLowerCase());

        if (!manga) {
            await interaction.editReply(`❌ Obra "${tituloParaSimular}" não encontrada no banco de dados.`);
            return;
        }

        const channel = await interaction.client.channels.fetch(manga.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            await interaction.editReply(`❌ Canal de notificação configurado não é válido.`);
            return;
        }

        // --- 1. DADOS FAKE (SIMULAÇÃO) ---
        const capituloSimulado = manga.lastChapter + 1;
        const tituloCapituloSimulado = "Título de Exemplo"; // Texto fixo para você ver como fica

        // Gera URLs falsas baseadas no padrão (sem verificar se existem)
        let novaUrlSakura = "";
        const match = manga.urlBase.match(/(\d+)\/?$/);
        if (match) {
            novaUrlSakura = manga.urlBase.replace(match[1], capituloSimulado.toString());
        } else {
            novaUrlSakura = `${manga.urlBase}${capituloSimulado}/`;
        }

        // --- 2. MONTAGEM DOS BOTÕES ---
        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Ler no Sakura')
                    .setEmoji('🌸') 
                    .setStyle(ButtonStyle.Link) 
                    .setURL(novaUrlSakura), 
                new ButtonBuilder()
                    .setLabel('Mangapark')
                    .setEmoji('🎢')
                    .setStyle(ButtonStyle.Link)
                    .setURL(manga.urlMangapark || "https://mangapark.net"),
                new ButtonBuilder()
                    .setLabel('MangaTaro')
                    .setEmoji('🎴')
                    .setStyle(ButtonStyle.Link)
                    .setURL(manga.urlMangataro || "https://mangataro.org/home")
            );

        // --- 3. MONTAGEM DO TEXTO (Lógica Idêntica ao Monitor) ---
        let mensagemFinal = manga.mensagemPadrao || "O **capítulo {capitulo}** de @{titulo}, **\"{nome_capitulo}\"** já está disponível.\n\n*aproveitem e boa leitura.*";

        // Aplica o título fake
        mensagemFinal = mensagemFinal.replace(/{nome_capitulo}/g, tituloCapituloSimulado);

        // Substituições Padrão
        mensagemFinal = mensagemFinal
            .replace(/{capitulo}/g, capituloSimulado.toString())
            .replace(/{titulo}/g, manga.titulo)
            .replace(/{link_sakura}/g, '') 
            .replace(/{link_mangapark}/g, '')
            .replace(/{link_mangataro}/g, '');
        
        // Limpeza
        mensagemFinal = mensagemFinal.replace(/[ \t]{2,}/g, " ").replace(/ ,/g, ",");

        // --- 4. MENÇÃO DE CARGO ---
        const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === manga.titulo.toLowerCase());
        if (role) {
            mensagemFinal = mensagemFinal.replace(`@${manga.titulo}`, role.toString());
        } else {
            // Se não tiver cargo criado, deixa em negrito pra não ficar feio na simulação
            mensagemFinal = mensagemFinal.replace(`@${manga.titulo}`, `**${manga.titulo}**`);
        }

        // --- 5. ENVIO ---
        try {
            const textChannel = channel as TextChannel;
            
            const payload: any = { 
                content: mensagemFinal.trim(),
                components: [row] 
            };

            // Se tiver imagem salva no JSON, anexa ela
            if (manga.imagem) {
                payload.files = [manga.imagem];
            }

            await textChannel.send(payload);

            await interaction.editReply(`✅ **Visualização enviada!** Verifique o canal ${textChannel}.`);

        } catch (error) {
            console.error(error);
            await interaction.editReply(`❌ Erro ao enviar mensagem: ${(error as Error).message}`);
        }
    }
});