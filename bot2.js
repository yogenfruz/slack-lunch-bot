
if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('botkit');
var underscore = require('underscore');
var os = require('os');
var botConfig = require('./config.js');

var stateMachine = require('./lib/StateMachines.js');

var globalListenMode = botConfig.globalListenMode;

function LunchState() {
	this.whosIn = {};
	this.whoDrove = {};
	this.restaurantsLeft = [];
};

function ChannelState() {
	this.lunchState = new LunchState();
	this.restaurants = {};
}

function Restaurant(name, requiresCar) {
	this.name = name;
	this.requiresCar = requiresCar;
}

function Driver(user, howMany) {
	this.user = user;
	this.howMany = howMany;
}

function User(userId, userName) {
	this.userId = userId;
	this.userName = userName;
}

function VetoUser(userId, userName, hasVetoed) {
	this.userId = userId;
	this.userName = userName;
	this.hasVetoed = hasVetoed;
}

var controller = Botkit.slackbot({
    debug: false,
	json_file_store: 'json_file_store'
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();



Object.values = obj => Object.keys(obj).map(key => obj[key]);

var idleToRoleCall = new stateMachine.Transition('begin', 'idle', 'roleCall');
var roleCallToGatherRestaurants = new stateMachine.Transition('next-step', 'roleCall', 'gatherRestaurants');
var roleCallToIdle = new stateMachine.Transition('cancel', 'roleCall', 'idle');
var gatherRestaurantsToVeto = new stateMachine.Transition('next-step', 'gatherRestaurants', 'veto');
var gatherRestaurantsToIdle = new stateMachine.Transition('cancel', 'gatherRestaurants', 'idle');

var idleStateCallback = function (bot, message, channelState, stateManager) {
	bot.reply(message, "Okay, let's have lunch.");
	bot.reply(message, "Who's in and who drove?");
	channelState.lunchState = new LunchState();
	stateManager.handleSignal('begin');
	return channelState;
};

var idleStateLetsHaveLunchHandler = new stateMachine.StateEventHandler(['lets have lunch'], idleStateCallback);

var idleState = new stateMachine.StateObject('idle', [idleStateLetsHaveLunchHandler]);

var roleCallStateCallback = function (bot, message, channelState, stateManager) {
	bot.reply(message, "Got message from user " + message.user);
	bot.reply(message, "Message was " + message.text);
	return channelState;
};

var rolleCallImInHandler = new stateMachine.StateEventHandler(["i'm in", "me"], roleCallStateCallback);

var roleCallState = new stateMachine.StateObject('roleCall', [rolleCallImInHandler]);


var askRestaurantName = function(response, convo) {
	convo.ask("What is the name of the restaurant you wish to add?", function(response, convo) {
		convo.say("Cool.");
		askRestaurantRequiresCar(response, convo);
		convo.next();
	});
}

var askRestaurantRequiresCar = function(response, convo) {
	convo.ask("Does it require a car to get to?", function(response, convo) {
		convo.say("Cool");
		convo.next();
	});
}

var addRestaurantCallback = function (bot, message, channelState, stateManager) {
	bot.reply(message, "Okay, let's add a restaurant.");
	bot.startConversation(message, askRestaurantName);
	return channelState;
}

var addRestaurantHandler = new stateMachine.StateEventHandler(["add restaurant"], addRestaurantCallback);

var allTransitions = [idleToRoleCall, roleCallToGatherRestaurants, roleCallToIdle, gatherRestaurantsToVeto, gatherRestaurantsToIdle];
var allStates = [idleState, roleCallState];
var allGlobalEvents = [addRestaurantHandler];

var stateManager = new stateMachine.StateManager(allStates, allTransitions, allGlobalEvents, controller, globalListenMode);

stateManager.init();