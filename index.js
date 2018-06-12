const yargs = require("yargs");
const config = require("config.json");

const SnooStream = require("snoostream");
const Snoowrap = require("snoowrap");

const version = require("package.json").version;

const snooWrap = new Snoowrap({
	username: config.username,
	password: config.password,
	clientId: config.clientID,
	clientSecret: config.clientSecret,
	userAgent: `RedditEco ${version} by haykam821`,
});

const snooStream = SnooStream(snooWrap);