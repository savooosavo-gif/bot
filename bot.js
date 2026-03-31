const { Client, GatewayIntentBits, ChannelType, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN environment variable is not set.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function createAnnouncementOrText(guild, name, parentId) {
  try {
    return await guild.channels.create({
      name,
      type: ChannelType.GuildAnnouncement,
      parent: parentId,
    });
  } catch {
    console.log(`Note: #${name} created as text channel (Community mode not enabled)`);
    return await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: parentId,
    });
  }
}

async function buildServerLayout(guild) {
  const announce = await guild.channels.create({ name: "ANNOUNCEMENTS", type: ChannelType.GuildCategory });
  await createAnnouncementOrText(guild, "announcements", announce.id);
  await createAnnouncementOrText(guild, "partners", announce.id);

  const content = await guild.channels.create({ name: "CONTENT", type: ChannelType.GuildCategory });
  await guild.channels.create({ name: "media", type: ChannelType.GuildText, parent: content.id });
  await guild.channels.create({ name: "clips", type: ChannelType.GuildText, parent: content.id });
  await guild.channels.create({ name: "grind", type: ChannelType.GuildText, parent: content.id });

  const start = await guild.channels.create({ name: "START", type: ChannelType.GuildCategory });
  await guild.channels.create({ name: "rules", type: ChannelType.GuildText, parent: start.id });
  await guild.channels.create({ name: "roster", type: ChannelType.GuildText, parent: start.id });

  const lobby = await guild.channels.create({ name: "LOBBY", type: ChannelType.GuildCategory });
  await guild.channels.create({ name: "general", type: ChannelType.GuildText, parent: lobby.id });
  await guild.channels.create({ name: "self-promo", type: ChannelType.GuildText, parent: lobby.id });

  const voice = await guild.channels.create({ name: "VOICE", type: ChannelType.GuildCategory });
  await guild.channels.create({ name: "chill", type: ChannelType.GuildVoice, parent: voice.id });
  await guild.channels.create({ name: "talk", type: ChannelType.GuildVoice, parent: voice.id });
}

async function handleSetup(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  console.log(`/setup triggered in: ${guild.name} by ${interaction.user.tag}`);

  try {
    console.log("Deleting all channels...");
    const channels = await guild.channels.fetch();
    for (const [, channel] of channels) {
      if (channel) {
        try { await channel.delete(); } catch (err) {
          console.warn(`Could not delete channel ${channel.name}:`, err);
        }
      }
    }
    console.log("All channels deleted.");

    console.log("Building new server layout...");
    await buildServerLayout(guild);
    console.log("Server layout created successfully!");

    await interaction.followUp({ content: "Server setup complete! All channels have been recreated.", ephemeral: true });
  } catch (err) {
    console.error("Error during /setup:", err);
    try {
      await interaction.followUp({ content: "Something went wrong during setup. Check the bot logs.", ephemeral: true });
    } catch { }
  }
}

async function handleEmbed(interaction) {
  const title = interaction.options.getString("title");
  const description = interaction.options.getString("description");
  const colorInput = interaction.options.getString("color") ?? "#5865F2";
  const targetChannel = interaction.options.getChannel("channel") ?? interaction.channel;

  const hexColor = colorInput.replace("#", "");
  const colorInt = /^[0-9a-fA-F]{6}$/.test(hexColor) ? parseInt(hexColor, 16) : 0x5865F2;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(colorInt)
    .setTimestamp()
    .setFooter({ text: `Sent by ${interaction.user.username}` });

  try {
    await targetChannel.send({ embeds: [embed] });
    await interaction.reply({ content: `Embed sent to ${targetChannel}.`, ephemeral: true });
    console.log(`/embed sent to #${targetChannel.name} by ${interaction.user.tag}`);
  } catch (err) {
    console.error("Error sending embed:", err);
    await interaction.reply({ content: "Failed to send the embed. Make sure I have permission to send messages in that channel.", ephemeral: true });
  }
}

client.once("clientReady", async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  const rest = new REST().setToken(token);
  const commands = [
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Wipe all channels and rebuild the full server layout")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .toJSON(),
    new SlashCommandBuilder()
      .setName("embed")
      .setDescription("Send a custom embed message to a channel")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addStringOption((opt) => opt.setName("title").setDescription("The title of the embed").setRequired(true))
      .addStringOption((opt) => opt.setName("description").setDescription("The body text of the embed").setRequired(true))
      .addStringOption((opt) => opt.setName("color").setDescription("Hex color code (e.g. #FF5733) — defaults to Discord blurple").setRequired(false))
      .addChannelOption((opt) =>
        opt.setName("channel").setDescription("Channel to send the embed to — defaults to current channel").setRequired(false)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
      .toJSON(),
  ];

  for (const [guildId] of readyClient.guilds.cache) {
    try {
      await rest.put(Routes.applicationGuildCommands(readyClient.user.id, guildId), { body: commands });
      console.log(`Registered commands in guild: ${guildId}`);
    } catch (err) {
      console.warn(`Failed to register commands in guild ${guildId}:`, err);
    }
  }

  console.log("Bot is ready — /setup and /embed are active");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "setup") await handleSetup(interaction);
  if (interaction.commandName === "embed") await handleEmbed(interaction);
});

client.login(token);
