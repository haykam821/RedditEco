/*
	Roles:
		0. banned (NYI)
		1. user
		2. admin
*/

const yargs = require("yargs");

const config = require("./config.json");
const items = require("./items.json");

const SnooStream = require("snoostream");
const Snoowrap = require("snoowrap");

const mdTable = require("markdown-table");
const escaper = require("markdown-escape");

const version = require("./package.json").version;

const epilogue = "\n\n---\n\n*[PUBLIC BETA] This action was performed automatically. See r/RedditEco for more information.*";

const db = require("mysql-promise")();
db.configure(config.database);

db.query(`CREATE TABLE IF NOT EXISTS users(
    reddit VARCHAR(20),
    balance INT(15) DEFAULT 0,
    role INT(1) DEFAULT 1
)`);
db.query(`CREATE TABLE IF NOT EXISTS items(
    id INT(11) NOT NULL AUTO_INCREMENT,
    reddit VARCHAR(20),
    item INT(11),
    renamed VARCHAR(32),
    PRIMARY KEY (id)
)`);

const bot = new Snoowrap({
	username: config.auth.username,
	password: config.auth.password,
	clientId: config.auth.clientID,
	clientSecret: config.auth.clientSecret,
	userAgent: `RedditEco ${version} by haykam821`,
});

async function userExists(name) {
	const matches = await db.query("SELECT * FROM users WHERE reddit = ?", [
		name,
	]);
	return matches[0].length > 0;
}
async function getUser(name) {
	const matches = await db.query("SELECT * FROM users WHERE reddit = ?", [
		name,
	]);
	return matches[0][0];
}
async function getOwnedItems(name) {
	const matches = await db.query("SELECT * FROM items WHERE reddit = ?", [
		name,
	]);
	return matches[0].map(row => {
		const item = items[row.item];

		item.renamed = row.renamed;
		item.trueName = item.renamed ? item.renamed : item.name;
		item.markedName = item.renamed ? `**${item.renamed}** (${item.name})` : `**${item.name}**`;
		item.id = row.id;
		item.owner = row.reddit;

		return item;
	});
}
async function changeBalance(name, by) {
	return await db.query("UPDATE users SET balance = balance + ? WHERE reddit = ?", [
		name,
		by,
	]);
}

yargs.command("docs", "Replies with a link to the docs.", {}, argv => {
	argv.reply("A user guide is available on [GitHub](https://github.com/haykam821/RedditEco/blob/master/GUIDE.md) and you can ask questions in r/RedditEco.");
});
yargs.command("register", "Signs you up for an account.", {}, async argv => {
	if (await userExists(argv.comment.author.name)) {
		argv.reply("You already have an account.");
	} else {
		await db.query("INSERT INTO users (reddit, balance) VALUES (?, ?)", [
			argv.comment.author.name,
			config.currency.startBalance,
		]);
		argv.reply(`Congratulations! You now have an account with ${config.currency.startBalance} ${config.currency.plural} in it.`);
	}
});
yargs.command("give <reciever> <amount> [comment]", "Gives a user money.", {
	reciever: {
		description: "The reciever of the money you would like to give.",
		type: "string",
	},
	amount: {
		description: "The amount of money to give.",
		type: "number",
	},
	comment: {
		description: "A comment for the reciever, explaining why the money was given to them.",
		type: "string",
	},
}, async argv => {
	const sender = await getUser(argv.comment.author.name);

	// only if admin)
	if (sender.role > 1) {
		const response = [];

		if (!await userExists(argv.reciever)) {
			await db.query("INSERT INTO users (reddit, balance) VALUES (?, ?)", [
				argv.reciever,
				config.currency.startBalance,
			]);
			response.push("That person did not have an account, so it was automatically created for them.");
		}
		await changeBalance(argv.reciever, argv.amount);
		response.push(`You have successfully given ${argv.amount} ${config.currency.plural} to ${argv.reciever}.`);

		if (argv.comment) {
			response.push(`Reason for transfer:\n\n> ${escaper(argv.comment)}`);
		}

		argv.reply(response.join(" "));
	} else {
		argv.reply("You are not an admin!");
	}
});
yargs.command("pay <reciever> <amount> [comment]", "Pays a user.", {
	reciever: {
		description: "The reciever of the money you would like to send in a transaction.",
		type: "string",
	},
	amount: {
		description: "The amount of money to send.",
		type: "number",
	},
	comment: {
		description: "A comment for the reciever, explaining why they got paid the money.",
		type: "string",
	},
}, async argv => {
	const response = [];

	if (await userExists(argv.reciever) && await userExists(argv.comment.author.name)) {
		const userFrom = await getUser(argv.comment.author.name);

		if (userFrom.balance >= argv.amount) {
			// Take balance from userFrom and give to reciever
			await changeBalance(userFrom, argv.amount * -1);
			await changeBalance(argv.reciever, argv.amount);

			response.push(`You have successfully transferred ${argv.amount} ${config.currency.plural} to u/${argv.reciever}.`);

			if (argv.comment) {
				response.push(`Reason for transfer:\n\n> ${escaper(argv.comment)}`);
			}
		} else {
			response.push("You do not have enough money to make the transaction.");
		}
	} else {
		response.push(`Both users involved in a transaction need an account, which is created with the following command:\n\n> u/${argv.bot.username} register`);
	}

	argv.reply(response.join(" "));
});
yargs.command("check <username>", "Checks a user's account", builder => {
	builder.positional("username", {
		description: "The user to check the account of.",
	});
}, async argv => {
	if (await userExists(argv.username)) {
		const reply = [];

		const user = await getUser(argv.username);

		reply.push("#" + user.reddit);
		reply.push(`${user.reddit} has ${user.balance} ${config.currency.plural} in their account.`);

		const userItems = await getOwnedItems(argv.username);

		reply.push(`They also have ${userItems.length} items in their inventory:`);
		reply.push(mdTable([
			["ID", "Name", "Lore"],
			...userItems.map(item => {
				return [
					"`" + item.id + "`",
					item.markedName,
					"*" + item.lore + "*",
				];
			}),
		]));

		argv.reply(reply.join("\n\n"));
	} else {
		argv.reply("That user does not have an account!");
	}
});

yargs.help(false);
yargs.version(false);

function isCommand(msg) {
	return msg.author.name !== bot.username && msg.body.split(" ")[0].includes("u/" + bot.username);
}

const snooStream = SnooStream(bot);
const stream = snooStream.commentStream(config.subreddits.join("+"));
stream.on("post", post => {
	if (!isCommand(post)) return;

	yargs.fail(() => {
		post.reply("Something went wrong! Are you sure you're using the correct syntax as defined in the [User Guide](https://github.com/haykam821/RedditEco/blob/master/GUIDE.md)?" + epilogue);
	});

	yargs.parse(post.body.split(" ").slice(1), {
		reddit: bot,
		comment: post,
		reply: async msg => {
			await post.reply(msg + epilogue);
		},
	});
});