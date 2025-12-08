import { createCommand } from "#base";
import { ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, SendableChannels } from "discord.js";
import { getMangas } from '../../utils/StateManager.js';
import fs from 'fs'; // Importante para verificar a imagem local

createCommand({
    name: "simular-novo-capitulo",
    description: "Gera uma prévia visual da mensagem de notificação neste canal.",
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

        // Confirma apenas para você que o comando foi recebido
        await interaction.deferReply({ ephemeral: true });

        const tituloParaSimular = interaction.options.getString("titulo", true);
        const mangas = getMangas();
        const manga = mangas.find(m => m.titulo?.toLowerCase() === tituloParaSimular.toLowerCase());

        if (!manga) {
            await interaction.editReply(`❌ Obra **"${tituloParaSimular}"** não encontrada no banco de dados.`);
            return;
        }

        // --- MUDANÇA PRINCIPAL AQUI ---
        // Em vez de buscar manga.channelId, pegamos o canal atual da interação
        const channel = interaction.channel as SendableChannels;

        if (!channel) {
            await interaction.editReply(`❌ Não foi possível identificar o canal atual.`);
            return;
        }

        // --- 1. DADOS FAKE (SIMULAÇÃO) ---
        const capituloSimulado = manga.lastChapter + 1;
        const tituloCapituloSimulado = "Título do Capítulo (Simulação)"; 

        // Gera URLs falsas baseadas no padrão
        let novaUrlSakura = "";
        const match = manga.urlBase.match(/(\d+)\/?$/);
        if (match) {
            novaUrlSakura = manga.urlBase.replace(match[1], capituloSimulado.toString());
        } else {
            novaUrlSakura = `${manga.urlBase}${capituloSimulado}/`;
        }

        // --- 2. MONTAGEM DOS BOTÕES (Lógica Segura) ---
        const buttons: ButtonBuilder[] = [];

        // Botão Sakura
        buttons.push(
            new ButtonBuilder()
                .setLabel('Ler no Sakura')
                .setEmoji('🌸') 
                .setStyle(ButtonStyle.Link) 
                .setURL(novaUrlSakura)
        );

        // Botão MangaPark
        if (manga.urlMangapark && manga.urlMangapark.startsWith('http')) {
            buttons.push(
                new ButtonBuilder()
                    .setLabel('Mangapark')
                    .setEmoji('🎢')
                    .setStyle(ButtonStyle.Link)
                    .setURL(manga.urlMangapark)
            );
        }

        // Botão MangaTaro
        if (manga.urlMangataro && manga.urlMangataro.startsWith('http')) {
            buttons.push(
                new ButtonBuilder()
                    .setLabel('MangaTaro')
                    .setEmoji('🎴')
                    .setStyle(ButtonStyle.Link)
                    .setURL(manga.urlMangataro)
            );
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

        // --- 3. MONTAGEM DO TEXTO ---
        let mensagemFinal = manga.mensagemPadrao || "O **capítulo {capitulo}** de @{titulo}, **\"{nome_capitulo}\"** já está disponível.\n\n*aproveitem e boa leitura.*";

        mensagemFinal = mensagemFinal.replace(/{nome_capitulo}/g, tituloCapituloSimulado);

        mensagemFinal = mensagemFinal
            .replace(/{capitulo}/g, capituloSimulado.toString())
            .replace(/{titulo}/g, manga.titulo)
            .replace(/{link_sakura}/g, '') 
            .replace(/{link_mangapark}/g, '')
            .replace(/{link_mangataro}/g, '')
            .replace(/🌸 \*\*Sakura:\*\*/g, '')
            .replace(/🎢\*\*Mangapark:\*\*/g, '')
            .replace(/🎴 \*\*MangaTaro:\*\*/g, '');
        
        // Limpeza
        mensagemFinal = mensagemFinal.replace(/[ \t]{2,}/g, " ").replace(/ ,/g, ",");

        // --- 4. MENÇÃO DE CARGO ---
        const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === manga.titulo.toLowerCase());
        if (role) {
            mensagemFinal = mensagemFinal.replace(`@${manga.titulo}`, role.toString());
        } else {
            // Se não tiver cargo, deixa em negrito apenas visualmente
            mensagemFinal = mensagemFinal.replace(`@${manga.titulo}`, `**@${manga.titulo}**`);
        }

        // --- 5. ENVIO ---
        try {
            const payload: any = { 
                content: mensagemFinal.trim(),
                components: [row] 
            };

            // Tratamento de Imagem (Local ou URL)
            if (manga.imagem) {
                if (fs.existsSync(manga.imagem)) {
                    // Se for arquivo local
                    payload.files = [manga.imagem];
                } else if (manga.imagem.startsWith('http')) {
                    // Se for URL antiga (legado)
                    payload.content += `\n${manga.imagem}`; // Anexa link no fim se não der pra fazer upload
                }
            }

            // Envia no canal ATUAL
            await channel.send(payload);

            await interaction.editReply(`✅ **Simulação enviada abaixo!**`);

        } catch (error) {
            console.error(error);
            await interaction.editReply(`❌ Erro ao enviar mensagem neste canal: ${(error as Error).message}`);
        }
    }
});