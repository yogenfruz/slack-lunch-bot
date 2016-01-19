
if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('botkit');
var underscore = require('underscore');
var os = require('os');
var botConfig = require('./config.js');

var globalListenMode = botConfig.globalListenMode;

logFunc = function() {
	if (botConfig.loggingEnable == false) {
		return;
	}
	console.log(arguments);
}

function LunchState() {
	this.whosIn = {};
	this.whoDrove = {};
	this.restaurantsLeft = [];
	this.lunchStateMachine = {};
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

getChannelState = function(channelId, cb) {
	controller.storage.channels.get(channelId, function(err, channelState){
		if(!channelState) {
			console.log("Creating brand new channel state");
			channelState = new ChannelState();
			channelState.id = channelId;
		}
		cb(err, channelState);
	});
}

saveChannelState = function(channelData, cb) {
	controller.storage.channels.save(channelData, cb);
}

function Transition(eventName, sourceState, targetState) {
	this.eventName = eventName;
	this.sourceState = sourceState
	this.targetState = targetState;
}

function StateObject(stateName, phrasesToRecognize, stateCallback) {
	this.stateName = stateName;
	this.phrasesToRecognize = phrasesToRecognize;
	this.stateCallback = stateCallback;
	this.stateIsActive = false;
	
	this.activateState = function() {
		this.stateIsActive = true;
	}
	
	this.deactivateState = function() {
		this.stateIsActive = false;
	}
	
	this.testState = function(bot, message) {
		var phrase = message.text;
		var obj = this;
		if (this.doesPhraseMatchPhrasesToRecognize(phrase)) {
			getChannelState(message.channel, function(err, channelState) {
				logFunc(JSON.stringify(channelState));
				logFunc(JSON.stringify(obj));
				var newChannelState = obj.stateCallback(bot, message, channelState, stateManager);
				saveChannelState(newChannelState, function(err, id) {});
			} );
		}
	}
	
	this.doesPhraseMatchPhrasesToRecognize = function(phrase) {
		var anyMatch = false;
		for (matchPhraseIdx = 0; matchPhraseIdx < this.phrasesToRecognize.length; ++matchPhraseIdx) {
			var matchPhrase = this.phrasesToRecognize[matchPhraseIdx];
			matchRegex = new RegExp(matchPhrase);
			anyMatch = matchRegex.test(phrase);
			if (anyMatch == true) {
				break;
			}
		}
		return anyMatch;
	}
}

function StateManager(states, transitions, controller) {
	this.states = states;
	this.controller = controller;
	this.transitions = transitions;
	
	this.hearCallback = function(bot, message) {
		for (stateIdx = 0; stateIdx < this.states.length; ++stateIdx) {
			var state = this.states[stateIdx];
			if (state.stateIsActive) {
				state.testState(bot, message, this);
			}
		}
	}
	
	this.handleSignal = function(signal) {
		logFunc("Got signal " + signal);
		var activeState = this.getActiveState();
		
		for (transitionIdx = 0; transitionIdx < this.transitions.length; ++transitionIdx) {
			var transition = this.transitions[transitionIdx];
			if (signal == transition.eventName) {
				logFunc("Want to go from state " + transition.sourceState + " to " + transition.targetState);
				if (transition.sourceState == activeState.stateName) {
					logFunc("Found sourceState " + activeState);
					var newActiveState = underscore.find(this.states, function(state) { return state.stateName == transition.targetState});
					logFunc("Found targetState " + newActiveState);
					activeState.deactivateState();
					activeState = newActiveState;
					newActiveState.activateState();
				}
			}
		}
		logFunc(JSON.stringify(states));
	}
	
	this.getActiveState = function() {
		for (stateIdx = 0; stateIdx < this.states.length; ++stateIdx) {
			var state = this.states[stateIdx];
			if (state.stateIsActive) {
				return state;
			}
		}
	}
	
	this.init = function(){
		var allPhrases = [];
		for (stateIdx = 0; stateIdx < this.states.length; ++stateIdx) {
			var state = this.states[stateIdx];
			logFunc("Found state " + JSON.stringify(state));
			for (phraseIdx = 0; phraseIdx < state.phrasesToRecognize.length; ++phraseIdx) {
				var phrase = state.phrasesToRecognize[phraseIdx];
				allPhrases.push(phrase);
			}
		}
		uniquePhrases = underscore.uniq(allPhrases);
		logFunc("Unique phrases");
		logFunc(JSON.stringify(uniquePhrases));
		
		this.allPhrases = uniquePhrases;
		
		// Let's always start the first state
		this.states[0].activateState();
		
		var obj = this;
		var callbackFunc = function(bot, message) {
			obj.hearCallback(bot, message);
		}
		
		this.controller.hears(this.allPhrases, globalListenMode, callbackFunc);
	}
}

Object.values = obj => Object.keys(obj).map(key => obj[key]);

var idleToRoleCall = new Transition('begin', 'idle', 'roleCall');
var roleCallToGatherRestaurants = new Transition('next-step', 'roleCall', 'gatherRestaurants');
var roleCallToIdle = new Transition('cancel', 'roleCall', 'idle');
var gatherRestaurantsToVeto = new Transition('next-step', 'gatherRestaurants', 'veto');
var gatherRestaurantsToIdle = new Transition('cancel', 'gatherRestaurants', 'idle');

var idleStateCallback = function (bot, message, channelState, stateManager) {
	bot.reply(message, "Okay, let's have lunch.");
	bot.reply(message, "Who's in and who drove?");
	channelState.lunchState = new LunchState();
	stateManager.handleSignal('begin');
	return channelState;
};

var idleState = new StateObject('idle', ['lets have lunch'], idleStateCallback );

var roleCallStateCallback = function (bot, message, channelState, stateManager) {
	bot.reply(message, "Got message from user " + message.user);
	bot.reply(message, "Message was " + message.text);
	return channelState;
};

var roleCallState = new StateObject('roleCall', ['me', "i'm in", "(@.+) is in"], roleCallStateCallback);

var allTransitions = [idleToRoleCall, roleCallToGatherRestaurants, roleCallToIdle, gatherRestaurantsToVeto, gatherRestaurantsToIdle];
var allStates = [idleState, roleCallState];

var stateManager = new StateManager(allStates, allTransitions, controller);

stateManager.init();