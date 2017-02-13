
if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('botkit');
var underscore = require('underscore');
var os = require('os');
var botConfig = require('./config.js');

var stateMachine = require('bot-state-machine');

var roleCallState = require('./states/RoleCallState.js');
var idleState = require('./states/IdleState.js');
var gatherRestaurants = require('./states/GatherRestaurants.js');

var addRestaurantGlobalEvent = require('./states/AddRestaurantGlobalEvent.js');

var globalListenMode = botConfig.globalListenMode;

var controller = Botkit.slackbot({
    debug: false,
	json_file_store: 'json_file_store'
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();



var allTransitions = [];
var allStates = [];
var allGlobalEvents = [];

var stateModules = [idleState, roleCallState, gatherRestaurants, addRestaurantGlobalEvent];

for (var stateModuleIdx = 0; stateModuleIdx < stateModules.length; ++stateModuleIdx) {
	var stateModule = stateModules[stateModuleIdx];
	allTransitions.push.apply(allTransitions, stateModule.transitions);
	allStates.push.apply(allStates, stateModule.states);
	allGlobalEvents.push.apply(allGlobalEvents, stateModule.globalEvents);	
}

var stateManager = new stateMachine.StateManager(allStates, allTransitions, allGlobalEvents, controller, globalListenMode);

stateManager.init();