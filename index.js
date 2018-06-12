const yargs = require("yargs");
const config = require("./config.json");

const SnooStream = require("snoostream");
const Snoowrap = require("snoowrap");

const version = require("./package.json").version;

const bot = new Snoowrap({
	username: config.auth.username,
	password: config.auth.password,
	clientId: config.auth.clientID,
	clientSecret: config.auth.clientSecret,
	userAgent: `RedditEco ${version} by haykam821`,
});

yargs.command("docs", "Replies with a link to the docs.", {}, argv => {
    argv.comment.reply(`A user guide is available on [GitHub](https://github.com/haykam821/RedditEco/blob/master/GUIDE.md) and you can ask questions in r/RedditEco.`);
});

function isCommand(msg) {
    return author.name !== bot.username //&& msg.body.split(" ")[0].includes(bot.username);
}

const snooStream = SnooStream(bot);
const stream = snooStream.commentStream("RedditEcoTest");
stream.on("post", post => {
    if (!isCommand(post)) return;
    yargs.parse(post.body.split(" ").slice(1), {
        reddit: bot,
        comment: post,
    });
});