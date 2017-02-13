var lunchData = require('../lib/LunchData.js');
var stateMachine = require('bot-state-machine');

var underscore = require('underscore');

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

var addRestaurantHandler = new stateMachine.StateEventHandler(["add restaurant"], addRestaurantCallback, "begin a conversation to add a new restaurant to the list.");

var allTransitions = [];
var allStates = [];
var allGlobalEvents = [addRestaurantHandler]

module.exports = {
	states: allStates,
	transitions: allTransitions,
	globalEvents: allGlobalEvents
}