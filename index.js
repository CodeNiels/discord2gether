const Discord = require('discord.js');
const client = new Discord.Client();
const fetch = require('node-fetch');
const vision = require('@google-cloud/vision');
const selectRandomFile = require('./helpers/select-random-file');
const listenToUser = require('./listenToUser');
const fs = require('fs');
const STARTBUDGET = 100;

require('dotenv').config();

let generalChannel = null;
let lastEmbeddedVideoUrl = null;
let democratMode = false;
let republicanMode = false;

//Dish out free currency every 5 minutes.
//Constraint: balance of user is below 1000.
setInterval(giveFreeCurrency, 300000);


//Create users.json on boot.
fs.writeFile("users.json", "[]", { flag: 'wx' }, function (err) {
    if (err) throw err;
    console.log("File users.json created!");
});

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    generalChannel = client.channels.cache.find(channel => channel.name === 'general');
});

client.on('message', msg => {
    let args = msg.content.split(" ");
    const [url] = msg.content.match(
        /((?:https?:)?\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?/
    ) || [null];


    lastEmbeddedVideoUrl = url || lastEmbeddedVideoUrl;

    if (msg.author.bot || msg.content.charAt(0) != "!") {
        //if message has been sent by bot himself, dont reply.
        //if the prefix of ! is not satisfied, dont interpret said message.
        return
    }

    switch (args[0]) {
        case '!prune': {

            if (args[1].match(/^[0-9]*$/)) {
                msg.channel.bulkDelete(args[1]);
                msg.reply(`I just deleted ${args[1]} messages.`);
            }

            return;
        }

        case '!subscribe':
            console.log(`### ${msg.author.username} - SUBSCRIBE REQUEST ###`);
            subscribe(msg.author.id);
            break;



        case '!balance':
            console.log(`### ${msg.author.username} - BALANCE REQUEST ###`);
            const user = getUser(msg.author.id);
            msg.reply(
                `Your balance is: **${user.balance}**`
            );
            break;



        // gamble with amount
        case '!gamble':
            if (args[1].match(/^allin$/)) {
                gambleAllIn(msg.author.id);
            } else if (args[1].match(/^[0-9]*$/)) {
                const bet = args[1]
                gamble(msg.author.id, bet);
            } else {
                msg.reply("Wrong usage... USAGE: !gamble <allin> || <AMOUNT>")
            }
            break;


        case '!donate':

            // Regex on arguments.
            if (args[1].match(/^<@![0-9]*>$/) && args[2].match(/^[0-9]*$/)) {
                const recipientId = args[1].substring(3, args[1].length - 1);
                const donateAmount = args[2];
                donate(msg.author.id, recipientId, donateAmount);
            }
            else {
                msg.reply("Wrong usage... USAGE: !donate <@User> <AMOUNT>")
            }



            break;



        case '!info':
            msg.reply('```!gamble <AMOUNT> => Place a bet against 50/50 Odds!\n!donate @Username <AMOUNT> => donate currency to another player!\n!subscribe => subscribe to the gambling bot!\n!balance => check your balance```')
            break;



        case '!w2g':
            getWatchTogetherLink(lastEmbeddedVideoUrl).then(url => msg.reply(`Room created at: ${url}`));


            break;



        case '!democrat mode':
            democratMode = !democratMode;
            msg.reply('Democrat mode is now ' + (democratMode ? 'on' : 'off'));


            break;



        case '!republican mode':
            republicanMode = !republicanMode;
            msg.reply('Republican mode is now ' + (republicanMode ? 'on' : 'off'));


            break;

        case '!inspire me':
            inspireMe(msg.channel);


            break;


        default: {
            msg.reply('Invalid command!');
        }



    }
});


function gambleAllIn(userId) {
    const user = getUser(userId);
    if (!user) {
        generalChannel.send(
            'You are not subscribed to the gambling service! \n type **!subscribe** to join in! <:kkool:451833139820757012>'
        );
        return;
    }
    console.log(
        `### BET PLACED (ALL IN) ###\nAuthor: ${user.id}\nAmount: ${user.balance}`
    );
    const coinflip = Math.random();
    // if coinflip wins (needs fix for exact 0.5)
    if (coinflip > 0.5) {
        user.balance = Number(user.balance) * 2;
        generalChannel.send(
            `<@${user.id}> You risked it all and... WON! Current Balance : **${user.balance
            }** <:kkool:451833139820757012>`
        );
    }
    else {
        user.balance = 0;
        generalChannel.send(
            ` <@${user.id}> You risked it all and... LOST! Current Balance : **${user.balance
            }** :angry:`
        );
    }

    updateUser(user);
    return;
}

function gamble(userId, amount) {
    const user = getUser(userId);
    if (!user) {
        generalChannel.send(
            'You are not subscribed to the gambling service! \n type **!subscribe** to join in! <:kkool:451833139820757012>'
        );
        return;
    }

    console.log(`### BET PLACED ###\nAuthor: ${user.id}\nAmount: ${amount}`);

    // amount must be a number
    // amount needs to be higher the currentBalance
    // amount needs to be a positive Integer
    // If 1 of these conditions are not met (||) we return;
    if (isNaN(amount) || amount > user.balance || amount < 0) {
        console.log(`${amount} = INVALID!`);
        const msg =
            `Oops, **${amount}** is not a valid bet...` +
            '```\n- Bet amount needs to be a number!\n- You need to be able to afford it, your balance: ' +
            user.balance +
            '\n- Bet amount needs to be > 0```';
        generalChannel.send(`<@${user.id}> ` + msg);
        return;
    }
    else {
        console.log(`${amount} = VALID! -> Continuing...`);
        // Do a gamble against 50/50 Odds.
        const coinflip = Math.random();
        // if coinflip wins (needs fix for exact 0.5)
        if (coinflip > 0.52) {
            user.balance = Number(user.balance) + Number(amount);
            generalChannel.send(
                `<@${user.id}> You WON! Current Balance : **${user.balance
                }** <:kkool:451833139820757012>`
            );
        }
        else {
            user.balance = Number(user.balance) - Number(amount);
            generalChannel.send(
                ` <@${user.id}> You LOST! Current Balance : **${user.balance}** :angry:`
            );
        }

        updateUser(user);
        return;
    }
}

function subscribe(userId) {
    // The user typing the command
    const data = fs.readFileSync('users.json');
    const json = JSON.parse(data);

    // If the user is already subscribed return;
    if (json.some(item => item.id == userId.toString())) {
        generalChannel.send(
            `<@${userId}> You are already subscribed to the gamble bot!`
        );
        return;
    }

    // Else add the user
    addUser(userId);
    generalChannel.send(
        `<@${userId}> is now subscribed to the gamble bot, happy gambling!`
    );
}

function getUser(id) {
    const data = fs.readFileSync('users.json');
    const json = JSON.parse(data);
    const user = json.find(item => item.id == id.toString());
    return user;
}
async function updateUser(user) {
    // BUFFER -> JSON
    const data = fs.readFileSync('users.json');
    const json = JSON.parse(data);
    let isUpdated = false;

    // Update the user that has matching IDs.
    json.forEach(element => {
        if (element.id == user.id) {
            element.balance = Number(user.balance);
            isUpdated = true;
        }
    });

    // Overwrite file with updated user.
    if (isUpdated) {
        fs.writeFileSync('users.json', JSON.stringify(json), 'utf8', () => {
            console.log({
                id: user.id,
                balance: user.balance,
                status: 'SUCCESS',
            });
        });
        return { result: 'SUCCESS' };
    }
    else {
        console.log({
            id: user.id,
            balance: user.balance,
            status: 'FAILED TO ADD',
        });
        return { result: 'FAILED' };
    }
}

function addUser(userId) {
    // user = The user typing the command.
    const data = fs.readFileSync('users.json');
    const json = JSON.parse(data);

    // If the user is already subscribed, return;
    if (json.some(item => item.id == userId.toString())) {
        return;
    }

    const newUser = { id: userId, balance: STARTBUDGET };
    // If the user is unique, add him to the json array;
    json.push(newUser);
    fs.writeFileSync('users.json', JSON.stringify(json), 'utf8');
}

async function donate(donatorId, recipientId, amount) {


    const donation = Number(amount);
    const donator = getUser(donatorId);
    const recipient = getUser(recipientId);

    if (donator == null || recipient == null || donator == recipient) {
        generalChannel.send(
            'Something went wrong...\nMake sure you and the recipient are both subscribed to the gamble service. (!subscribe)\n USAGE: !donate @User <AMOUNT>'
        );
        return;
    }

    if (isNaN(donation)) {
        generalChannel.send(
            `<@${donator.id
            }>, no donation amount specified... USAGE: !donate @User <AMOUNT>`
        );
        return;
    }

    if (donation < 0) {
        generalChannel.send(
            `<@${donator.id
            }>, donation amount can't be negative... USAGE: !donate @User <AMOUNT>`
        );
        return;
    }

    // donator loses amount
    const oldbalance = donator.balance;
    donator.balance = donator.balance - donation;

    // check if the donator isn't too generous...
    if (donator.balance < 0) {
        generalChannel.send(
            `<@${donator.id
            }>, you can't donate that, you'll end up broke! (${oldbalance})`
        );
        return;
    }

    updateUser(donator);
    // recipient loses amount
    recipient.balance = recipient.balance + donation;
    updateUser(recipient);

    generalChannel.send(
        `<@${donator.id}> has donated **${donation}** to <@${recipient.id
        }>! , so generous!`
    );
    console.log(
        `### DONATION ###\nDonator: ${donator.id} ===> Recipient: ${recipient.id
        }\nAmount: ${donation}`
    );
}


function giveFreeCurrency() {


    let data = fs.readFileSync('users.json');
    const json = JSON.parse(data);
    json.forEach(user => {
        // Add 1
        if (user.balance >= 1000) {
            return;
        }
        user.balance = user.balance + 5;
    });

    data = JSON.stringify(json);
    fs.writeFileSync('users.json', data);
    console.log('Dishing out free credits!');
}



function inspireMe(channel = generalChannel) {
    if (!channel) {
        return;
    }

    channel.startTyping();

    getQuote().then(({ quote, url }) => {
        console.log(url);
        const embed = new Discord.MessageEmbed().setImage(url);
        channel.stopTyping();
        channel.send(quote, { tts: true, embed: embed });
    });
}

client.on('guildMemberSpeaking', (member, speaking) => {
    if (speaking.bitfield) {
        listenToUser({ member, playFromDir, inspireMe });
    }

    if (democratMode && speaking.bitfield > 0) {
        playFromDir(member.voice.channel, './sounds/biden/');
    }
    if (republicanMode && speaking.bitfield > 0) {
        playFromDir(member.voice.channel, './sounds/trump/');
    }
});

// client.on('typingStart', (channel, user) => {
// console.log(user.presence);
// if (user.presence.member.voice) {
//     playFromDir(user.presence.member.voice.channel, './sounds/typing/')
// }
// });

client.on('voiceStateUpdate', async (oldState, newState) => {
    if (oldState.channel !== newState.channel) {
        // left general
        if (oldState.channel && oldState.channel.name === 'General') {
            playFromDir(oldState.channel, './sounds/disconnected/');
        }

        // joined general
        if (newState.channel && newState.channel.name === 'General') {
        }
    }

    // unmute
    if (oldState.selfDeaf && !newState.selfDeaf) {
        playFromDir(oldState.channel, './sounds/undeafened/');
    }
});

client.login(process.env.DISCORD_TOKEN);

async function getWatchTogetherLink(videoUrl = '') {
    const response = await fetch('https://w2g.tv/rooms/create.json', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            share: videoUrl,
            api_key: process.env.W2G_API_KEY,
        }),
    });

    const res = await response.json();

    return `https://w2g.tv/rooms/${res.streamkey}`;
}

async function getQuote() {
    const response = await fetch('http://inspirobot.me/api?generate=true');

    const url = await response.text();

    const client = new vision.ImageAnnotatorClient();
    client.api_key;

    const [result] = await client.textDetection(url);
    let quote =
        result.textAnnotations[0]?.description ||
        'WATCH FOR MASSIVE BALLOT COUNTING ABUSE AND, JUST LIKE THE EARLY VACCINE, REMEMBER I TOLD YOU SO!';
    quote = quote.replace(/(\r\n|\n|\r)/gm, ' ').toLowerCase();

    console.log(quote);

    return { quote, url };
}

async function playFromDir(channel, dir) {
    const file = await selectRandomFile(dir);

    return play(channel, dir + file);
}

async function play(channel, file) {
    const connection = await channel.join();

    connection.play(file);
}
