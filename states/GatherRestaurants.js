var lunchData = require('../lib/LunchData.js');
var stateMachine = require('bot-state-machine');

var underscore = require('underscore');

var gatherRestaurantsToVeto = new stateMachine.Transition('next-step', 'gatherRestaurants', 'veto');
var gatherRestaurantsToIdle = new stateMachine.Transition('cancel', 'gatherRestaurants', 'idle');

var gatherRestaurantsActivateCallback = function (bot, message) {
	bot.reply("Okay, gathering some restaurants");
	var stateManager = this.stateManager;
	
}

var idleState = new stateMachine.StateObject('gatherRestaurants', [], gatherRestaurantsActivateCallback);

var allTransitions = [gatherRestaurantsToVeto, gatherRestaurantsToIdle];
var allStates = [idleState];

module.exports = {
	states: allStates,
	transitions: allTransitions,
	globalEvents: []
}