var underscore = require('underscore');

var getChannelState = function (controller, channelId, cb) {
	controller.storage.channels.get(channelId, function (err, channelState) {
		if (!channelState) {
			console.log("Creating brand new channel state");
			channelState = new Object();
			channelState.id = channelId;
		}
		cb(err, channelState);
	});
}

var saveChannelState = function (controller, channelData, cb) {
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

    this.handleMessage = function (bot, message, channelState, stateManager) {
        var phrase = message.text;
        var obj = this;
        if (this.doesHandlePhrase(phrase)) {
            var newChannelState = obj.stateCallback(bot, message, channelState, stateManager);
            return newChannelState;
        }
        return channelState;
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

function StateObject(stateName, stateEventHandlers) {
	this.stateName = stateName;
    this.stateEventHandlers = stateEventHandlers;
	this.stateIsActive = false;

	this.activateState = function () {
		this.stateIsActive = true;
	}

	this.deactivateState = function () {
		this.stateIsActive = false;
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

}

function StateManager(states, transitions, globalEvents, controller, globalListenMode) {
	this.states = states;
	this.controller = controller;
	this.transitions = transitions;
	this.globalEvents = globalEvents;
	this.globalListenMode = globalListenMode;

	this.hearCallback = function (controller, bot, message) {
        var obj = this;
		getChannelState(controller, message.channel, function (err, channelState) {
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
            saveChannelState(controller, channelState, function (err, id) { });
        });
	}

	this.handleSignal = function (signal) {
		var activeState = this.getActiveState();

		for (var transitionIdx = 0; transitionIdx < this.transitions.length; ++transitionIdx) {
			var transition = this.transitions[transitionIdx];
			if (signal == transition.eventName) {
				if (transition.sourceState == activeState.stateName) {
					var newActiveState = underscore.find(this.states, function (state) { return state.stateName == transition.targetState });
					activeState.deactivateState();
					activeState = newActiveState;
					newActiveState.activateState();
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
		var callbackFunc = function (bot, message) {
			obj.hearCallback(obj.controller, bot, message);
		}

		this.controller.hears(this.allPhrases, this.globalListenMode, callbackFunc);
	}
}

module.exports = {
	StateManager: StateManager,
	StateObject: StateObject,
	Transition: Transition,
	StateEventHandler: StateEventHandler,
};