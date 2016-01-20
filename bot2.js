
if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('botkit');
var underscore = require('underscore');
var os = require('os');
var botConfig = require('./config.js');

var globalListenMode = botConfig.globalListenMode;

var logFunc = function() {
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

var getChannelState = function(channelId, cb) {
	controller.storage.channels.get(channelId, function(err, channelState){
		if(!channelState) {
			console.log("Creating brand new channel state");
			channelState = new ChannelState();
			channelState.id = channelId;
		}
		cb(err, channelState);
	});
}

var saveChannelState = function(channelData, cb) {
	controller.storage.channels.save(channelData, cb);
}

function Transition(eventName, sourceState, targetState) {
	this.eventName = eventName;
	this.sourceState = sourceState
	this.targetState = targetState;
}

function StateEventHandler(phrasesToRecognize, stateCallback) {
    this.phrasesToRecognize = phrasesToRecognize;
    this.stateCallback = stateCallback;
    
    this.handleMessage = function(bot, message) {
        var phrase = message.text;
        var obj = this;
        if (this.doesHandlePhrase(phrase)) {
            getChannelState(message.channel, function(err, channelState) {
               logFunc(JSON.stringify(channelState));
               logFunc(JSON.stringify(obj));
               var newChannelState = obj.stateCallback(bot, message, channelState, stateManager);
               saveChannelState(newChannelState); 
            });
        }
    }
    
    this.doesHandlePhrase = function(phrase) {
        logFunc(JSON.stringify(this) + " testing to see if we handle phrase " + phrase);
		for (var matchPhraseIdx = 0; matchPhraseIdx < this.phrasesToRecognize.length; ++matchPhraseIdx) {
			var matchPhrase = this.phrasesToRecognize[matchPhraseIdx];
			var matchRegex = new RegExp(matchPhrase);
			if (matchRegex.test(phrase) == true) {
				return true;
			}
		}
		return false;
	}
}

function StateObject(stateName, stateEventHandlers) {
	this.stateName = stateName;
    this.stateEventHandlers =  stateEventHandlers;
	this.stateIsActive = false;
	
	this.activateState = function() {
		this.stateIsActive = true;
	}
	
	this.deactivateState = function() {
		this.stateIsActive = false;
	}
    
    this.phrasesToRecognize = function() {
        var phrases = [];
        for (var stateEventHandlerIdx = 0; stateEventHandlerIdx < stateEventHandlers.length; ++stateEventHandlerIdx) {
            var stateEventHandler = this.stateEventHandlers[stateEventHandlerIdx];
            phrases.push(stateEventHandler.phrasesToRecognize);
        }
        var flattenedPhrases = underscore.flatten(phrases);
        var uniquePhrases = underscore.unique(flattenedPhrases);
        return uniquePhrases;
    }
	
	this.tryHandleMessage = function(bot, message) {
		var phrase = message.text;
		for (var stateEventHandlerIdx = 0; stateEventHandlerIdx < stateEventHandlers.length; ++stateEventHandlerIdx) {
            var stateEventHandler = stateEventHandlers[stateEventHandlerIdx];
            if (stateEventHandler.doesHandlePhrase(phrase)) {
                stateEventHandler.handleMessage(bot, message);
            }
        }
	}
    
    this.doesHandlePhrase = function(phrase) {
        for (var stateEventHandlerIdx = 0; stateEventHandlerIdx < stateEventHandlers.length; ++stateEventHandlerIdx) {
            var stateEventHandler = stateEventHandlers[stateEventHandlerIdx];
            if (stateEventHandler.doesHandlePhrase(phrase)) {
                return true;
            }
        }
        return false;
    }	
	
}

function StateManager(states, transitions, controller) {
	this.states = states;
	this.controller = controller;
	this.transitions = transitions;
	
	this.hearCallback = function(bot, message) {
		for (var stateIdx = 0; stateIdx < this.states.length; ++stateIdx) {
			var state = this.states[stateIdx];
			if (state.stateIsActive) {
				state.tryHandleMessage(bot, message, this);
			}
		}
	}
	
	this.handleSignal = function(signal) {
		logFunc("Got signal " + signal);
		var activeState = this.getActiveState();
		
		for (var transitionIdx = 0; transitionIdx < this.transitions.length; ++transitionIdx) {
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
		for (var stateIdx = 0; stateIdx < this.states.length; ++stateIdx) {
			var state = this.states[stateIdx];
			if (state.stateIsActive) {
				return state;
			}
		}
	}
	
	this.init = function(){
		var allPhrases = [];
		for (var stateIdx = 0; stateIdx < this.states.length; ++stateIdx) {
			var state = this.states[stateIdx];
			logFunc("Found state " + JSON.stringify(state));
            var statePhrases = state.phrasesToRecognize();
            logFunc(statePhrases);
			for (var phraseIdx = 0; phraseIdx < statePhrases.length; ++phraseIdx) {
				var phrase = statePhrases[phraseIdx];
				allPhrases.push(phrase);
			}
		}
		var uniquePhrases = underscore.uniq(allPhrases);
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

var idleStateLetsHaveLunchHandler = new StateEventHandler(['lets have lunch'], idleStateCallback);

var idleState = new StateObject('idle', [idleStateLetsHaveLunchHandler] );

var roleCallStateCallback = function (bot, message, channelState, stateManager) {
	bot.reply(message, "Got message from user " + message.user);
	bot.reply(message, "Message was " + message.text);
	return channelState;
};

var rolleCallImInHandler = new StateEventHandler(["i'm in", "me"], roleCallStateCallback);

var roleCallState = new StateObject('roleCall', [rolleCallImInHandler]);

var allTransitions = [idleToRoleCall, roleCallToGatherRestaurants, roleCallToIdle, gatherRestaurantsToVeto, gatherRestaurantsToIdle];
var allStates = [idleState, roleCallState];

var stateManager = new StateManager(allStates, allTransitions, controller);

stateManager.init();