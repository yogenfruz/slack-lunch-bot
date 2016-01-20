
if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('botkit');
var underscore = require('underscore');
var os = require('os');
var botConfig = require('./config.js');

var globalListenMode = botConfig.globalListenMode;

var controller = Botkit.slackbot({
    debug: false,
	json_file_store: 'json_file_store'
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

function LunchState() {
	this.whosIn = {};
	this.whoDrove = {};
	this.restaurantsLeft = [];
	this.state = 'idle';
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

Object.values = obj => Object.keys(obj).map(key => obj[key]);

getChannelState = function (channelId, cb) {
	controller.storage.channels.get(channelId, function (err, channelState) {
		if (!channelState) {
			console.log("Creating brand new channel state");
			channelState = new ChannelState();
			channelState.id = channelId;
		}
		cb(err, channelState);
	});
}

saveChannelState = function (channelData, cb) {
	controller.storage.channels.save(channelData, cb);
}

controller.hears(['lets have lunch'], globalListenMode, function (bot, message) {
	getChannelState(message.channel, function (err, channelState) {
		if (channelState.lunchState) {
			if (channelState.lunchState.state != "idle") {
				bot.reply(message, "Abandoning current lunch -> ");
				bot.reply(message, JSON.stringify(channelState.lunchState));
			}
		}
		channelState.lunchState = new LunchState();

		channelState.lunchState.state = 'whosIn';
		lunchStateMachine.handle(channelState.lunchState.lunchStateMachine, "letsHaveLunch");
		saveChannelState(channelState, function (err, id) {
			bot.reply(message, "Let's have lunch then! Who's in?");

		});
	});
});

controller.hears(['me', 'i am', 'yes', 'yeah', 'i did', "i'm in"], globalListenMode, function (bot, message) {
	getChannelState(message.channel, function (err, channelState) {
		if (!channelState) {
			return;
		}
		lunchState = channelState.lunchState;
		if (!lunchState) {
			return;
		}
		switch (lunchState.state) {
			case 'whosIn':
				handleAffirmativeInWhosIn(bot, message, channelState);
				break;
			case 'whoDrove':
				handleAffirmativeBeginDriveConvo(bot, message, channelState);
				break;
			default:
				bot.reply(message, "I'm not in the right state for affimative replies. I am in state " + lunchState.state);
				break;
		}

	});

});

handleAffirmativeInWhosIn = function (bot, message, channelState) {
	bot.api.users.info({ user: message.user }, function (err, userInfo) {
		userId = message.user;
		userName = userInfo.user.name;
		lunchState = channelState.lunchState;
		if (!lunchState.whosIn[userId]) {
			lunchState.whosIn[userId] = new VetoUser(userId, userName, false);
			bot.reply(message, "Cool, " + userName + " is in.");
		}
		else {
			bot.reply(message, "You're already in");
		}
		channelState.lunchState = lunchState;
		saveChannelState(channelState, function (err, id) {
			whosIn = [];
			for (user in lunchState.whosIn) {
				whosIn.push(lunchState.whosIn[user].userName);
			}
			bot.reply(message, "The following people are in: " + Object.values(whosIn).join(', '));
		});
	});

}

handleAffirmativeBeginDriveConvo = function (bot, message, channelState) {
	bot.api.users.info({ user: message.user }, function (err, userInfo) {
		userId = message.user;
		userName = userInfo.user.name;
		lunchState = channelState.lunchState;
		bot.startConversation(message, function (response, convo) {
			convoDroveInStepHowMany({ userId: userId, userName: userName }, channelState, response, convo);
		});
	});
}

convoDroveInStepHowMany = function (whoDrove, channelState, response, convo) {
	convo.ask("Okay, " + whoDrove.userName + ". How many people can your car take?", function (response, convo) {
		convo.say("An answer!");
		howMany = parseInt(response.text);
		if (isNaN(howMany)) {
			convo.say("Sorry, but I don't understand " + response.text);
			convo.say("I asked how many people your car can hold!");
			convo.repeat();
			convo.next();
			return;
		}
		bot.api.users.info({ user: response.user }, function (err, userInfo) {
			userId = response.user;
			userName = userInfo.user.name;
			driverUser = new Driver(new User(userId, userName), howMany);
			channelState.lunchState.whoDrove[userId] = driverUser;
			convo.say("Cool. I'm adding driver " + userName + " who can take " + howMany + " people.");
			saveChannelState(channelState, function (err, id) { });
			convo.next();
		});
	});
}

controller.hears(['next step'], globalListenMode, function (bot, message) {
	getChannelState(message.channel, function (err, channelState) {
		if (!channelState) {
			return;
		}
		if (!channelState.lunchState) {
			return;
		}
		if (channelState.lunchState.state == 'idle') {
			return;
		}
		cb = function () { };
		switch (channelState.lunchState.state) {
			case 'whosIn':
				channelState.lunchState.state = 'whoDrove';
				bot.reply(message, "Okay. Let's move on. Who drove in today?");
				break;
			case 'whoDrove':
				channelState.lunchState.state = 'startingVetoProcess';
				bot.reply(message, "Okay, let's move on. Starting veto process");
				cb = function (err, id) {
					startVetoProcess(bot, channelState, message);
				}
				break;
			default:
				bot.reply(message, "I'm very confused about how to proceed out of state " + channelState.lunchState.state);
		}
		saveChannelState(channelState, cb);
	});
});

startVetoProcess = function (bot, channelState, message) {
	lunchState = channelState.lunchState;
	numLunchers = Object.keys(lunchState.whosIn).length;
	numCarSeats = 0;
	for (driver in lunchState.whoDrove) {
		droveState = lunchState.whoDrove[driver];
		numCarSeats += droveState.howMany;
	}
	bot.reply(message, "Okay! We have " + numLunchers + " lunchers and " + numCarSeats + " car seats.");
	weAreDriving = (numCarSeats >= numLunchers);
	if (weAreDriving) {
		bot.reply(message, "We can drive!");
	}
	else {
		bot.reply(message, "We can't drive!");
	}
	filteredRestaurants = getSomeRestaurants(bot, message, channelState, weAreDriving, numLunchers + 1);
	bot.reply(message, "Okay, we have some restaurants to veto");
	bot.reply(message, filteredRestaurants.join("|"));
	lunchState.state = 'vetoProcess';
	lunchState.restaurantsLeft = filteredRestaurants;
	if (filteredRestaurants.length == 1) {
		bot.reply(message, "We only have 1 restaurant in the list! Congratulations " + filteredRestaurants[0] + ", you're the winner!");
		lunchState = new LunchState();
	}
	channelState.lunchState = lunchState;
	saveChannelState(channelState, function (err, id) { });
}

controller.hears(['veto (.*)'], globalListenMode, function (bot, message) {
	getChannelState(message.channel, function (err, channelState) {
		if (!channelState.lunchState) {
			return;
		}
		if (channelState.lunchState.state != 'vetoProcess') {
			return;
		}
		lunchState = channelState.lunchState;
		restaurantsLeft = lunchState.restaurantsLeft;
		var matches = message.text.match(/veto (.*)/i);
		var retaurantVeto = matches[1];
		var messageUserId = message.user;
		var messageUser = lunchState.whosIn[messageUserId];
		if (messageUser.hasVetoed == true) {
			bot.reply(message, "Sorry " + messageUser.userName + ", you've already veto'ed a restaurant");
			bot.reply(message, "Restaurants left: " + restaurantsLeft.join("|"));
			return;
		}

		var restarauntVetoIdx = restaurantsLeft.indexOf(retaurantVeto);
		if (restarauntVetoIdx == -1) {
			bot.reply(message, "Sorry, I don't understand the restaurant " + retaurantVeto);
			bot.reply(message, "Restaurants left: " + restaurantsLeft.join("|"));
			return;
		}
		messageUser.hasVetoed = true;
		restaurantsLeft.splice(restarauntVetoIdx, 1);
		lunchState.restaurantsLeft = restaurantsLeft;
		bot.reply(message, "Accepted veto of " + retaurantVeto + " from " + messageUser.userName);
		if (restaurantsLeft.length == 1) {
			bot.reply(message, "We are done veto process. Congratulations " + restaurantsLeft[0] + ", you're the winner!");
			bot.reply(message, "Enjoy lunch!");
			lunchState = new LunchState();
		}
		else {
			bot.reply(message, "Cool. We have the following restaurants left: " + restaurantsLeft.join("|"));
		}
		channelState.lunchState = lunchState;
		saveChannelState(channelState, function (err, id) { });
	});
});

getSomeRestaurants = function (bot, message, channelState, weAreDriving, numLunchers) {
	restaurants = channelState.restaurants;
	filteredRestaurants = Object.keys(restaurants).filter(function (restaurant) {
		return (restaurants[restaurant].requiresCar == weAreDriving);
	});
	return underscore.sample(filteredRestaurants, numLunchers);
}

controller.hears(['cancel lunch'], globalListenMode, function (bot, message) {
	getChannelState(message.channel, function (err, channelState) {
		if (!channelState) {
			return;
		}
		if (!channelState.lunchState) {
			return;
		}
		if (channelState.lunchState.state == 'idle') {
			return;
		}
		bot.reply(message, "Got it. I'm abandoning the current lunch ->");
		bot.reply(message, JSON.stringify(channelState.lunchState));
		channelState.lunchState = new LunchState();
		saveChannelState(channelState, function (err, id) { });
	});
});

controller.hears(['what are we doing'], globalListenMode, function (bot, message) {
	getChannelState(message.channel, function (err, channelState) {
		if (!channelState) {
			return;
		}
		if (!channelState.lunchState) {
			return;
		}
		lunchState = channelState.lunchState;
		bot.reply(message, "We're in the lunch state " + lunchState.state);
		bot.reply(message, "The following people are in for lunch: ");
		for (whosIn in lunchState.whosIn) {
			user = lunchState.whosIn[whosIn].userName;
			bot.reply(message, user);
		}
		bot.reply(message, "The following people drove in:");
		for (whoDrove in lunchState.whoDrove) {
			droveState = lunchState.whoDrove[whoDrove];
			bot.reply(message, droveState.user.userName + " and can take " + droveState.howMany);
		}
		bot.reply(message, "We have the following restaurants left in the veto list:" + lunchState.restaurantsLeft.join("|"));
	});
});

controller.hears(['add restaurant'], globalListenMode, function (bot, message) {
	getChannelState(message.channel, function (err, channelState) {
		if (!channelState) {
			return;
		}
		if (!channelState.restaurants) {
			channelState.restaurants = {};
		}
		bot.api.users.info({ user: message.user }, function (err, userInfo) {
			userId = message.user;
			userName = userInfo.user.name;
			console.log("Start convo");
			console.log(JSON.stringify(message));
			bot.startConversation(message, function (response, convo) {
				console.log("in convo");
				convoAddRestaurantGimmeName(userName, channelState, response, convo);
			});
		});
	});
});

convoAddRestaurantGimmeName = function (whosTalking, channelState, response, convo) {
	console.log("Got response1");
	convo.ask("Okay, " + whosTalking + ". What is the name of the new restaurant?", function (response, convo) {
		restaurantName = response.text;
		if (channelState.restaurants[restaurantName]) {
			convo.say("The restaurant " + restaurantName + " already exists. Please name a new restaurant");
			convo.repeat();
			convo.next();
			return;
		}
		convoAddRestaurantRequiresDriving(whosTalking, restaurantName, channelState, response, convo);
		convo.next();
	});

}

convoAddRestaurantRequiresDriving = function (whosTalking, restaurantName, channelState, response, convo) {
	convo.ask("Okay, " + whosTalking + ". Does " + restaurantName + " require a car to get to?", function (response, convo) {
		requiresCar = response.text;
		gotYes = bot.utterances.yes.test(requiresCar);
		gotNo = bot.utterances.no.test(requiresCar);
		if (!gotYes && !gotNo) {
			convo.say("Sorry, I didn't understand that.");
			convo.repeat();
		}
		else {
			convo.say("Got it! I'm going to add the restaurant " + restaurantName + " and it " + (gotYes ? "does" : "doesn't") + " require driving");
			newRestaurant = new Restaurant(restaurantName, gotYes);
			channelState.restaurants[restaurantName] = newRestaurant;
			saveChannelState(channelState, function (err, id) {

			});
		}
		convo.next();
	});

}

controller.hears(['show restaurants'], globalListenMode, function (bot, message) {
	bot.reply(message, "Okay! These are all of the restaurants I know about.");
	getChannelState(message.channel, function (err, channelState) {
		if (!channelState || !channelState.restaurants) {
			bot.reply(message, "I don't know about any restaurants. Please tell me about restaurants with 'add restaurant'");
			return;
		}
		for (restaurant in channelState.restaurants) {
			restaurantInfo = channelState.restaurants[restaurant];
			bot.reply(message, "There's one called " + restaurant + " that " + (restaurantInfo.requiresCar ? "does" : "doesn't") + " require a car");
		}
	});
});
