var underscore = require('underscore');

var ChannelState = function(controller, channelId, cb) {
	this.controller = controller;
	this.channelId = channelId;
	
	this.saveChannelState = function(cb) {
		this.controller.storage.channels.save(this.channelData, cb);
	}
	
	var obj = this;
	controller.storage.channels.get(channelId, function (err, channelState) {
		obj.channelData = channelState;
		if (!channelState) {
			console.log("Creating brand new channel data");
			obj.channelData = new Object();
			obj.channelData.id = channelId;
		}
		cb(obj, obj.channelData);
	});
}

function Transition(eventName, sourceState, targetState) {
	this.eventName = eventName;
	this.sourceState = sourceState
	this.targetState = targetState;
}

function StateEventHandler(phrasesToRecognize, stateCallback, helpText) {
    this.phrasesToRecognize = phrasesToRecognize;
    this.stateCallback = stateCallback;
	this.helpText = helpText;

    this.handleMessage = function (bot, message, channelState, stateManager) {
        var phrase = message.text;
        var obj = this;
        if (this.doesHandlePhrase(phrase)) {
            var newChannelState = obj.stateCallback(bot, message, channelState, stateManager);
            return newChannelState;
        }
        return channelState;
    }
	
	this.showHelp = function(bot, message) {
		bot.reply(message, "If I hear any of the following ");
		for (var phraseIdx = 0; phraseIdx < this.phrasesToRecognize.length; ++phraseIdx) {
			bot.reply(message, this.phrasesToRecognize[phraseIdx]);	
		}
		bot.reply(message, "then, I'll " + this.helpText);
	}

    this.doesHandlePhrase = function (phrase) {
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

function StateObject(stateName, stateEventHandlers, activateCallback, deactivateCallback) {
	this.stateName = stateName;
    this.stateEventHandlers = stateEventHandlers;
	this.stateIsActive = false;
	this.activateCallback = activateCallback;
	this.deactivateCallback = deactivateCallback;

	this.activateState = function (bot, message) {
		this.stateIsActive = true;
		if (!underscore.isUndefined(this.activateCallback)) {
			this.activateCallback(bot, message);
		}
	}

	this.deactivateState = function (bot, message) {
		this.stateIsActive = false;
		if (!underscore.isUndefined(this.deactivateCallback)) {
			this.deactivateCallback(bot, message)
		}
	}

    this.phrasesToRecognize = function () {
        var phrases = [];
        for (var stateEventHandlerIdx = 0; stateEventHandlerIdx < stateEventHandlers.length; ++stateEventHandlerIdx) {
            var stateEventHandler = this.stateEventHandlers[stateEventHandlerIdx];
            phrases.push(stateEventHandler.phrasesToRecognize);
        }
        var flattenedPhrases = underscore.flatten(phrases);
        var uniquePhrases = underscore.unique(flattenedPhrases);
        return uniquePhrases;
    }

	this.tryHandleMessage = function (bot, message, channelState, stateManager) {
		var phrase = message.text;
		for (var stateEventHandlerIdx = 0; stateEventHandlerIdx < stateEventHandlers.length; ++stateEventHandlerIdx) {
            var stateEventHandler = stateEventHandlers[stateEventHandlerIdx];
            if (stateEventHandler.doesHandlePhrase(phrase)) {
                channelState = stateEventHandler.handleMessage(bot, message, channelState, stateManager);
            }
        }
        return channelState;
	}

    this.doesHandlePhrase = function (phrase) {
        for (var stateEventHandlerIdx = 0; stateEventHandlerIdx < stateEventHandlers.length; ++stateEventHandlerIdx) {
            var stateEventHandler = stateEventHandlers[stateEventHandlerIdx];
            if (stateEventHandler.doesHandlePhrase(phrase)) {
                return true;
            }
        }
        return false;
    }
	
	this.showHelp = function (bot, message) {
		for (var stateEventHandlerIdx = 0; stateEventHandlerIdx < stateEventHandlers.length; ++stateEventHandlerIdx) {
            var stateEventHandler = stateEventHandlers[stateEventHandlerIdx];
			stateEventHandler.showHelp(bot, message);
		}
	}

}

function StateManager(states, transitions, globalEvents, controller, globalListenMode) {
	this.states = states;
	this.controller = controller;
	this.transitions = transitions;
	this.globalEvents = globalEvents;
	this.globalListenMode = globalListenMode;

	this.hearCallback = function (controller, bot, message) {
        var obj = this;
		var channelState = new ChannelState(controller, message.channel, function(channelState, channelData) {
			for (var stateIdx = 0; stateIdx < obj.states.length; ++stateIdx) {
                var state = obj.states[stateIdx];
                if (state.stateIsActive) {
                    var newChannelState = state.tryHandleMessage(bot, message, channelState, obj);
					if (underscore.isUndefined(newChannelState)) {
						channelState = newChannelState;
					}
                }
            }
			for (var globalEventIdx = 0; globalEventIdx < obj.globalEvents.length; ++globalEventIdx) {
				var globalEvent = obj.globalEvents[globalEventIdx];
				var newChannelState = globalEvent.handleMessage(bot, message, channelState, obj);
				if (underscore.isUndefined(newChannelState)) {
					channelState = newChannelState;
				}
			}
            channelState.saveChannelState(function (err, id) { });
		});
	}

	this.handleSignal = function (signal, bot, message) {
		var activeState = this.getActiveState();

		for (var transitionIdx = 0; transitionIdx < this.transitions.length; ++transitionIdx) {
			var transition = this.transitions[transitionIdx];
			if (signal == transition.eventName) {
				if (transition.sourceState == activeState.stateName) {
					var newActiveState = underscore.find(this.states, function (state) { return state.stateName == transition.targetState });
					activeState.deactivateState(bot, message);
					activeState = newActiveState;
					newActiveState.activateState(bot, message);
				}
			}
		}
	}

	this.getActiveState = function () {
		for (var stateIdx = 0; stateIdx < this.states.length; ++stateIdx) {
			var state = this.states[stateIdx];
			if (state.stateIsActive) {
				return state;
			}
		}
	}

	this.init = function () {
		var allPhrases = [];
		for (var stateIdx = 0; stateIdx < this.states.length; ++stateIdx) {
			var state = this.states[stateIdx];
			state.stateManager = this;
            var statePhrases = state.phrasesToRecognize();
			allPhrases.push(statePhrases);
		}
		for (var globalEventsIdx = 0; globalEventsIdx < this.globalEvents.length; ++globalEventsIdx) {
			var globalEvent = this.globalEvents[globalEventsIdx];
			var globalEventPhrases = globalEvent.phrasesToRecognize;
			allPhrases.push(globalEventPhrases);
		}
		var flattenedPhrases = underscore.flatten(allPhrases);
		var uniquePhrases = underscore.unique(flattenedPhrases);

		this.allPhrases = uniquePhrases;
		
		// Let's always start the first state
		this.states[0].activateState();

		var obj = this;
		
		var helpCallbackFunc = function(bot, message) {
			obj.handleHelp(bot, message);
		}
		
		this.controller.hears(["help me out", "i'm confused"], this.globalListenMode, helpCallbackFunc);
		
		var stateCallbackFunc = function (bot, message) {
			obj.hearCallback(obj.controller, bot, message);
		}
		
		this.controller.hears(this.allPhrases, this.globalListenMode, stateCallbackFunc);
	}
	
	this.handleHelp = function(bot, message) {
		for (var stateIdx = 0; stateIdx < this.states.length; ++stateIdx) {
                var state = this.states[stateIdx];
                if (state.stateIsActive) {
					state.showHelp(bot, message);
				}
		}
		
		for (var globalEventsIdx = 0; globalEventsIdx < this.globalEvents.length; ++globalEventsIdx) {
			var globalEvent = this.globalEvents[globalEventsIdx];
			globalEvent.showHelp(bot, message);
		}
	}
}

module.exports = {
	StateManager: StateManager,
	StateObject: StateObject,
	Transition: Transition,
	StateEventHandler: StateEventHandler,
	ChannelState: ChannelState,
};