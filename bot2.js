
if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('botkit');
var underscore = require('underscore');
var os = require('os');
var botConfig = require('./config.js');

var stateMachine = require('./lib/StateMachines.js');
var utils = require('./lib/Utils.js');

var roleCallState = require('./states/RoleCallState.js');
var idleState = require('./states/IdleState.js');

var addRestaurantGlobalEvent = require('./states/AddRestaurantGlobalEvent.js');

var globalListenMode = botConfig.globalListenMode;

var controller = Botkit.slackbot({
    debug: false,
	json_file_store: 'json_file_store'
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

var gatherRestaurantsToVeto = new stateMachine.Transition('next-step', 'gatherRestaurants', 'veto');
var gatherRestaurantsToIdle = new stateMachine.Transition('cancel', 'gatherRestaurants', 'idle');

var allTransitions = [gatherRestaurantsToVeto, gatherRestaurantsToIdle];
var allStates = [];
var allGlobalEvents = [];

var stateModules = [idleState, roleCallState, addRestaurantGlobalEvent];

for (var stateModuleIdx = 0; stateModuleIdx < stateModules.length; ++stateModuleIdx) {
	var stateModule = stateModules[stateModuleIdx];
	allTransitions.push.apply(allTransitions, stateModule.transitions);
	allStates.push.apply(allStates, stateModule.states);
	allGlobalEvents.push.apply(allGlobalEvents, stateModule.globalEvents);	
}

var stateManager = new stateMachine.StateManager(allStates, allTransitions, allGlobalEvents, controller, globalListenMode);

stateManager.init();