var lunchData = require('../lib/LunchData.js');
var stateMachine = require('bot-state-machine');

var underscore = require('underscore');

var idleToRoleCall = new stateMachine.Transition('begin', 'idle', 'roleCall');

var idleStateCallback = function (bot, message, channelState, stateManager) {
	bot.reply(message, "Okay, let's have lunch.");
	bot.reply(message, "Who's in and who drove?");
	var channelData = channelState.channelData;
	channelData.lunchState = new lunchData.LunchState();
	stateManager.handleSignal('begin', bot, message);
	return channelState;
};

var idleStateLetsHaveLunchHandler = new stateMachine.StateEventHandler(['lets have lunch'], idleStateCallback, "begin a lunch rolecall.");

var idleState = new stateMachine.StateObject('idle', [idleStateLetsHaveLunchHandler]);

var allTransitions = [idleToRoleCall];
var allStates = [idleState];

module.exports = {
	states: allStates,
	transitions: allTransitions,
	globalEvents: []
}