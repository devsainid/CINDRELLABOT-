import 'dotenv/config';
import fetch from 'node-fetch';
import { Telegraf } from 'telegraf';
import fs from 'fs';

const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = parseInt(process.env.OWNER_ID);

// Load co-owners from file
const coOwnersFile = './coowners.json';
let coOwners = [];

function loadCoOwners() {
  if (fs.existsSync(coOwnersFile)) {
    coOwners = JSON.parse(fs.readFileSync(coOwnersFile, 'utf-8'));
  }
}

function saveCoOwners() {
  fs.writeFileSync(coOwnersFile, JSON.stringify(coOwners, null, 2));
}

loadCoOwners();

const isAdmin = (id) => id === OWNER_ID || coOwners.includes(id);

const greetingRegex = /\b(hi|hello|hey|yo|hii|hlo)\b/i;

bot.start((ctx) => {
  ctx.reply("Hi! I'm your AI assistant 🤖\nType /add @username to add co-owner.");
});

bot.on('message', async (ctx) => {
  const msg = ctx.message;
  const isGroup = ctx.chat.type.includes('group');
  const isPrivate = ctx.chat.type === 'private';

  try {
    const name = msg.from?.first_name || "Unknown";
    const forwardText = `📨 Message from ${name} (${ctx.chat.type}) [${ctx.chat.title || 'Private'}]:\n${msg.text || '[Non-text]'}`;

    const forwardTo = [OWNER_ID, ...coOwners];
    for (const id of forwardTo) {
      await bot.telegram.sendMessage(id, forwardText);
    }
  } catch (err) {
    console.error("Forwarding Error:", err.message);
  }

  if (isGroup && greetingRegex.test(msg.text || '')) {
    return ctx.reply(`Hi ${msg.from.first_name}! 👋 How can I assist you?`);
  }

  if (isPrivate && msg.text) {
    try {
      const response = await fetch('https://api.mistral.vercel.app/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: msg.text }],
          model: 'mistral-7b-instruct',
        })
      });

      const data = await response.json();
      const reply = data?.response || "I couldn't respond right now.";
      ctx.reply(reply);
    } catch (err) {
      console.error("AI Error:", err.message);
      ctx.reply("Sorry, something went wrong.");
    }
  }
});

bot.command(['ban', 'mute', 'kick', 'delete'], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply("🚫 You are not authorized to use this command.");

  const replyUser = ctx.message.reply_to_message?.from;
  const replyMsgId = ctx.message.reply_to_message?.message_id;

  if (!replyUser) return ctx.reply("⚠️ Reply to a user's message to perform this action.");

  try {
    const command = ctx.message.text.split(' ')[0].substring(1);
    switch (command) {
      case 'ban':
        await ctx.banChatMember(replyUser.id);
        ctx.reply(`🚫 Banned @${replyUser.username || replyUser.first_name}`);
        break;
      case 'kick':
        await ctx.kickChatMember(replyUser.id);
        ctx.reply(`👢 Kicked @${replyUser.username || replyUser.first_name}`);
        break;
      case 'mute':
        await ctx.restrictChatMember(replyUser.id, {
          permissions: { can_send_messages: false }
        });
        ctx.reply(`🔇 Muted @${replyUser.username || replyUser.first_name}`);
        break;
      case 'delete':
        await ctx.deleteMessage(replyMsgId);
        ctx.reply(`🗑️ Message deleted.`);
        break;
    }
  } catch (err) {
    console.error("Command Error:", err.message);
    ctx.reply("❌ Failed to perform action. Make sure the bot is admin.");
  }
});

bot.command('add', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return ctx.reply("🚫 Only main owner can add co-owners.");
  const username = ctx.message.text.split(' ')[1]?.replace('@', '');
  if (!username) return ctx.reply("⚠️ Usage: /add @username");

  try {
    const user = await bot.telegram.getChat(`@${username}`);
    if (!coOwners.includes(user.id)) {
      coOwners.push(user.id);
      saveCoOwners();
      ctx.reply(`✅ @${username} added as co-owner.`);
    } else {
      ctx.reply(`ℹ️ @${username} is already a co-owner.`);
    }
  } catch {
    ctx.reply("❌ Invalid username or user not found.");
  }
});

bot.command('unadd', async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return ctx.reply("🚫 Only main owner can remove co-owners.");
  const username = ctx.message.text.split(' ')[1]?.replace('@', '');
  if (!username) return ctx.reply("⚠️ Usage: /unadd @username");

  try {
    const user = await bot.telegram.getChat(`@${username}`);
    if (coOwners.includes(user.id)) {
      coOwners = coOwners.filter(id => id !== user.id);
      saveCoOwners();
      ctx.reply(`❎ @${username} removed from co-owners.`);
    } else {
      ctx.reply(`ℹ️ @${username} is not a co-owner.`);
    }
  } catch {
    ctx.reply("❌ Invalid username or user not found.");
  }
});

bot.launch();
console.log("🤖 Bot is live with co-owner system!");
