var lunchData = require('../lib/LunchData.js');
var stateMachine = require('bot-state-machine');
var underscore = require('underscore');

var roleCallToGatherRestaurants = new stateMachine.Transition('next-step', 'roleCall', 'gatherRestaurants');
var roleCallToIdle = new stateMachine.Transition('cancel', 'roleCall', 'idle');

var roleCallImInCallback = function (bot, message, channelState, stateManager) {
	utils.getUserInfo(bot, message, function (userName) {
		var userId = message.user;
		var channelData = channelState.channelData;
		if (userName in channelData.lunchState.whosIn) {
			bot.reply(message, "You're already in.");
		}
		else {
			bot.reply(message, "Cool, " + userName + " is in.");
			var userToAdd = new lunchData.VetoUser(userId, userName, false);
			channelData.lunchState.whosIn[userName] = userToAdd;
		}
		var whosIn = underscore.keys(channelData.lunchState.whosIn);
		whosIn = underscore.flatten(whosIn);
		bot.reply(message, "The following people are in: " + whosIn.join(', '));
		channelState.saveChannelState(function (err, id) {} );
	});
	
	return channelState;
};

var roleCallImInHandler = new stateMachine.StateEventHandler(["i'm in", "me"], roleCallImInCallback, "add the current user to lunch.");

var addVehicleHowMany = function (userName, response, convo, controller) {
	convo.ask("How many people can your car take, " + userName  + "?", function (response, convo) {
		addVehicleFinish(userName, response, convo, controller);
	});
	convo.next();
}

var addVehicleFinish = function (userName, response, convo, controller) {
	var howMany = parseInt(response.text);
	if (isNaN(howMany)) {
		convo.say("Sorry, but I don't understand " + response.text);
		convo.repeat();
		convo.next();
	}
	else {
		stateMachine.ChannelState(controller, response.channel, function (channelState, channelData) {
			var driverUser = new lunchData.Driver(new lunchData.User(response.user, userName), howMany);
			if (userName in channelData.lunchState.whoDrove)
			{
				convo.say("Not adding a vehicle for user " + userName  + " because they are already driving.");
			}
			else
			{
				convo.say("Adding vehicle that can take " + howMany + " people, driven by " + userName);
				channelData.lunchState.whoDrove[userName] = driverUser;
				channelState.saveChannelState(function (err, id) {});	
			}
			convo.next();
		});
	}
}

var roleCallIDroveCallback = function (bot, message, channelState, stateManager) {
	utils.getUserInfo(bot, message, function (userName) {
		bot.startConversation(message, function (response, convo) {
			addVehicleHowMany(userName, response, convo, stateManager.controller);
		});	
	});
	return channelState;
};

var roleCallIDroveHandler = new stateMachine.StateEventHandler(['i drove'], roleCallIDroveCallback, "adds the current user's vehicle to lunch.");

var roleCallNextStepCallback = function (bot, message, channelState, stateManager) {
	bot.reply(message, "Okay, let's move on.");
	stateManager.handleSignal('next-step', bot, message);
	return channelState;
}

var roleCallNextStepHandler = new stateMachine.StateEventHandler(['lets move on', 'next step'], roleCallNextStepCallback, "advances the lunch conversation to the next step");

var roleCallState = new stateMachine.StateObject('roleCall', [roleCallImInHandler, roleCallIDroveHandler, roleCallNextStepHandler]);

var allTransitions = [roleCallToGatherRestaurants, roleCallToIdle];
var allStates = [roleCallState];

module.exports = {
	states: allStates,
	transitions: allTransitions,
	globalEvents: []
}