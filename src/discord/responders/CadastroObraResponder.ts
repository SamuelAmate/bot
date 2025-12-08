import { createResponder, ResponderType } from "#base";
import { SendableChannels } from "discord.js";
import { addManga, MangaEntry } from '../../utils/StateManager.js';

createResponder({
    customId: "/obras/cadastro",
    types: [ResponderType.Modal], 
    cache: "cached",
    async run(interaction) {
        if (!interaction.isModalSubmit() || !interaction.guild) return;
        
        const { fields } = interaction;
        const channelAtual = interaction.channel as SendableChannels;

        const titulo = fields.getTextInputValue("titulo");
        
        // --- LÓGICA DE SEPARAÇÃO DOS LINKS ---
        const textoLinks = fields.getTextInputValue("todos_links");
        
        // Quebra o texto onde tiver espaço, virgula ou quebra de linha
        const listaUrls = textoLinks.split(/[\s,\n]+/).filter(url => url.startsWith("http"));

        // Procura quem é quem baseado no nome do site
        const urlSakura = listaUrls.find(u => u.includes("sakura") || u.includes("lermanga") || u.includes("golden"));
        const urlMangapark = listaUrls.find(u => u.includes("mangapark"));
        const urlMangataro = listaUrls.find(u => u.includes("mangataro"));

        // Validação básica: O Sakura é obrigatório para o monitor funcionar
        if (!urlSakura) {
            await interaction.reply({ flags: ["Ephemeral"], content: "❌ **Erro:** Você precisa fornecer pelo menos o link do **Sakura** no campo de links." });
            return;
        }

        // Pega o capítulo do link do Sakura
        const match = urlSakura.match(/(\d+)\/?$/); 
        if (!match) {
            await interaction.reply({ flags: ["Ephemeral"], content: "❌ Não foi possível detectar o número do capítulo no link do Sakura." });
            return;
        }
        const ultimoCap = parseInt(match[1]);
        // Remove o número do final para criar a urlBase
        const urlBase = urlSakura.substring(0, urlSakura.length - match[0].length) + '/';

        // -------------------------------------

        const mensagemPadrao = fields.getTextInputValue("mensagem");
        const imagens = fields.getUploadedFiles("imagem"); 
        const imagemAnexada = imagens?.first(); 

        const canaisSelecionados = fields.getSelectedChannels("canal");
        const canalDestino = canaisSelecionados ? canaisSelecionados.first() as SendableChannels : null;

        if (!canalDestino) {
            await interaction.reply({ flags: ["Ephemeral"], content: "❌ Canal inválido." });
            return;
        }

        // Backup da Imagem
        let urlImagemFinal = "";
        if (imagemAnexada) {
            try {
                const msgBackup = await channelAtual.send({
                    content: `**Backup de Imagem:** ${titulo} não apague essa mensagem`,
                    files: [imagemAnexada.url] 
                });
                urlImagemFinal = msgBackup?.attachments.first()?.url || "";
            } catch (e) { console.error(e); }
        }

        const newEntry: MangaEntry = {
            titulo: titulo,
            urlBase: urlBase,
            lastChapter: ultimoCap, 
            channelId: canalDestino.id,
            mensagemPadrao: mensagemPadrao,
            imagem: urlImagemFinal,
            urlMangapark: urlMangapark, 
            urlMangataro: urlMangataro,
        };

        addManga(newEntry);
        
        await interaction.reply({
            content: `✅ **${titulo}** cadastrado!\n🌸 **Monitorando:** a partir do capítulo ${ultimoCap}\n🎢 **MangaPark:** ${urlMangapark ? 'Sim' : 'Não'}\n🎴 **MangaTaro:** ${urlMangataro ? 'Sim' : 'Não'}\n Para testar a mensagem utilize o comando /simular-novo-capitulo`
        });
    }
});