/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
          ______     ______     ______   __  __     __     ______
          /\  == \   /\  __ \   /\__  _\ /\ \/ /    /\ \   /\__  _\
          \ \  __<   \ \ \/\ \  \/_/\ \/ \ \  _"-.  \ \ \  \/_/\ \/
          \ \_____\  \ \_____\    \ \_\  \ \_\ \_\  \ \_\    \ \_\
           \/_____/   \/_____/     \/_/   \/_/\/_/   \/_/     \/_/


This is a sample Slack bot built with Botkit.

This bot demonstrates many of the core features of Botkit:

* Connect to Slack using the real time API
* Receive messages based on "spoken" patterns
* Reply to messages
* Use the conversation system to ask questions
* Use the built in storage system to store and retrieve information
  for a user.

# RUN THE BOT:

  Get a Bot token from Slack:

    -> http://my.slack.com/services/new/bot

  Run your bot from the command line:

    token=<MY TOKEN> node bot.js

# USE THE BOT:

  Find your bot inside Slack to send it a direct message.

  Say: "Hello"

  The bot will reply "Hello!"

  Say: "who are you?"

  The bot will tell you its name, where it running, and for how long.

  Say: "Call me <nickname>"

  Tell the bot your nickname. Now you are friends.

  Say: "who am I?"

  The bot will tell you your nickname, if it knows one for you.

  Say: "shutdown"

  The bot will ask if you are sure, and then shut itself down.

  Make sure to invite your bot into other channels using /invite @<my bot>!

# EXTEND THE BOT:

  Botkit is has many features for building cool and useful bots!

  Read all about it here:

    -> http://howdy.ai/botkit

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/


if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('./lib/Botkit.js');
var _ = require('./underscore-min.js');
var os = require('os');

var controller = Botkit.slackbot({
    debug: false,
	json_file_store: 'json_file_store'
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

function LunchState() {
	this.whos_in = {};
	this.who_drove = {};
	this.restaurants_left = [];
	this.state = 'idle';
};

function ChannelState() {
	this.lunch_state = new LunchState();
	this.restaurants = {};
}

function Restaurant(name, requires_car) {
	this.name = name;
	this.requires_car = requires_car;
}

function Driver(user, how_many) {
	this.user = user;
	this.how_many = how_many;
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

getChannelState = function(channelId, cb) {
	controller.storage.channels.get(channelId, function(err, channel_state){
		if(!channel_state) {
			console.log("Creating brand new channel state");
			channel_state = new ChannelState();
			channel_state.id = channelId;
		}
		cb(err, channel_state);
	});
}

saveChannelState = function(channel_data, cb) {
	controller.storage.channels.save(channel_data, cb);
}

controller.hears(['lets have lunch'], 'direct_message,direct_mention,mention', function(bot, message) {
	getChannelState(message.channel, function(err, channel_state) {
		if (channel_state.lunch_state) {
			if (channel_state.lunch_state.state != "idle") {
				bot.reply(message, "Abandoning current lunch -> ");
				bot.reply(message, JSON.stringify(channel_state.lunch_state));
			}
		}
		channel_state.lunch_state = new LunchState();		
		
		channel_state.lunch_state.state = 'whos_in';
		saveChannelState(channel_state, function(err, id) {
			bot.reply(message, "Let's have lunch then! Who's in?");
		});
	});
});

controller.hears(['me', 'i am', 'yes', 'yeah', 'i did', "i'm in"], 'direct_message,direct_mention,mention', function(bot, message) {
	getChannelState(message.channel, function(err, channel_state) {
		if (!channel_state) {
			return;
		}
		lunch_state = channel_state.lunch_state;
		if (!lunch_state) {
			return;
		}
		switch(lunch_state.state) {
			case 'whos_in':
				handleAffirmativeInWhosIn(bot, message, channel_state);
				break;
			case 'who_drove':
				handleAffirmativeBeginDriveConvo(bot, message, channel_state);
				break;
			default:
				bot.reply(message, "I'm not in the right state for affimative replies. I am in state " + lunch_state.state);
				break;
		}
		
	});
	
});

handleAffirmativeInWhosIn = function(bot, message, channel_state) {
	bot.api.users.info({user: message.user}, function (err, userInfo) {
		userId = message.user;
		userName = userInfo.user.name;
		lunch_state = channel_state.lunch_state;
		if (!lunch_state.whos_in[userId]) {
			lunch_state.whos_in[userId] = new VetoUser(userId, userName, false);
			bot.reply(message, "Cool, " + userName + " is in.");
		}
		else {
			bot.reply(message, "You're already in");
		}
		channel_state.lunch_state = lunch_state;
		saveChannelState(channel_state, function(err, id) {
			whos_in = [];
			for (user in lunch_state.whos_in) {
				whos_in.push(lunch_state.whos_in[user].userName);
			}
			bot.reply(message, "The following people are in: " + Object.values(whos_in).join(', '));
		});
	});
	
}

handleAffirmativeBeginDriveConvo = function(bot, message, channel_state) {
	bot.api.users.info({user: message.user}, function(err, userInfo) {
		userId = message.user;
		userName = userInfo.user.name;
		lunch_state = channel_state.lunch_state;
		bot.startConversation(message, function(response, convo) {
			convoDroveInStepHowMany({userId: userId, userName: userName}, channel_state, response, convo);
		});
	});
}

convoDroveInStepHowMany = function(who_drove, channel_state, response, convo) {
	convo.ask("Okay, " + who_drove.userName + ". How many people can your car take?", function(response, convo) {
		convo.say("An answer!");
		howMany = parseInt(response.text);
		if (howMany == NaN) {
			convo.say("Sorry, but I don't understand " + response.text);
			convo.say("I asked how many people your car can hold!");
			convo.repeat();
			convo.next();
			return;
		}
		bot.api.users.info({user: response.user}, function(err, userInfo) {
			userId = response.user;
			userName = userInfo.user.name;
			driverUser = new Driver( new User(userId, userName), howMany);
			channel_state.lunch_state.who_drove[userId] = driverUser;
			convo.say("Cool. I'm adding driver " + userName + " who can take " + howMany + " people.");
			saveChannelState(channel_state, function(err, id) {} );
			convo.next();
		});
	});
}

controller.hears(['next step'], 'direct_message,direct_mention,mention,ambient', function(bot, message) {
	getChannelState(message.channel, function(err, channel_state) {
		if (!channel_state) {
			return;
		}
		if (!channel_state.lunch_state) {
			return;
		}
		if (channel_state.lunch_state.state == 'idle') {
			return;
		}
		cb = function () {};
		switch (channel_state.lunch_state.state) {
			case 'whos_in':
				channel_state.lunch_state.state = 'who_drove';
				bot.reply(message, "Okay. Let's move on. Who drove in today?");
				break;
			case 'who_drove':
				channel_state.lunch_state.state = 'starting_veto_process';
				bot.reply(message, "Okay, let's move on. Starting veto process");
				cb = function(err, id) {
					startVetoProcess(bot, channel_state, message);
				}
				break;
			default:
				bot.reply(message, "I'm very confused about how to proceed out of state " + channel_state.lunch_state.state);
		}
		saveChannelState(channel_state, cb);
	});
});

startVetoProcess = function(bot, channel_state, message) {
	lunch_state = channel_state.lunch_state;
	numLunchers = Object.keys(lunch_state.whos_in).length;
	numCarSeats = 0;
	for (driver in lunch_state.who_drove) {
		drove_state = lunch_state.who_drove[driver];
		numCarSeats += drove_state.how_many;
	}
	bot.reply(message, "Okay! We have " + numLunchers + " lunchers and " + numCarSeats + " car seats.");
	weAreDriving = (numCarSeats >= numLunchers);
	if (weAreDriving) {
		bot.reply(message, "We can drive!");
	}
	else {
		bot.reply(message, "We can't drive!");
	}
	filteredRestaurants = getSomeRestaurants(bot, message, channel_state, weAreDriving, numLunchers + 1);
	bot.reply(message, "Okay, we have some restaurants to veto");
	bot.reply(message, filteredRestaurants.join("|"));
	lunch_state.state = 'veto_process';
	lunch_state.restaurants_left = filteredRestaurants;
	if (filteredRestaurants.length == 1) {
		bot.reply(message, "We only have 1 restaurant in the list! Congratulations " + filteredRestaurants[0] + ", you're the winner!");
		lunch_state = new LunchState();
	}
	channel_state.lunch_state = lunch_state;
	saveChannelState(channel_state, function(err, id) {});
}

controller.hears(['veto (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
	getChannelState(message.channel, function(err, channel_state) {
		if (!channel_state.lunch_state) {
			return;
		}
		if (channel_state.lunch_state.state != 'veto_process') {
			return;
		}
		lunch_state = channel_state.lunch_state;
		restaurants_left = lunch_state.restaurants_left;
		var matches = message.text.match(/veto (.*)/i);
		var retaurantVeto = matches[1];
		var messageUserId = message.user;
		var messageUser = lunch_state.whos_in[messageUserId];
		if (messageUser.hasVetoed == true) {
			bot.reply(message, "Sorry " + messageUser.userName + ", you've already veto'ed a restaurant");
			bot.reply(message, "Restaurants left: " + restaurants_left.join("|"));
			return;
		}
		
		var restarauntVetoIdx = restaurants_left.indexOf(retaurantVeto);
		if (restarauntVetoIdx == -1) {
			bot.reply(message, "Sorry, I don't understand the restaurant " + retaurantVeto);
			bot.reply(message, "Restaurants left: " + restaurants_left.join("|"));
			return;
		}
		messageUser.hasVetoed = true;
		restaurants_left.splice(restarauntVetoIdx, 1);
		lunch_state.restaurants_left = restaurants_left;
		bot.reply(message, "Accepted veto of " + retaurantVeto + " from " + messageUser.userName);
		if (restaurants_left.length == 1) {
			bot.reply(message, "We are done veto process. Congratulations " + restaurants_left[0] + ", you're the winner!");
			bot.reply(message, "Enjoy lunch!");
			lunch_state = new LunchState();
		}
		else {
			bot.reply(message, "Cool. We have the following restaurants left: " + restaurants_left.join("|"));
		}
		channel_state.lunch_state = lunch_state;
		saveChannelState(channel_state, function (err, id) {} );
	});
});

getSomeRestaurants = function(bot, message, channel_state, weAreDriving, numLunchers) {
	restaurants = channel_state.restaurants;
	filteredRestaurants = Object.keys(restaurants).filter(function(restaurant) {
		return (restaurants[restaurant].requires_car == weAreDriving);
	});
	return _.sample(filteredRestaurants, numLunchers);
}

controller.hears(['cancel lunch'], 'direct_message,direct_mention,mention', function(bot, message) {
	getChannelState(message.channel, function(err, channel_state) {
		if (!channel_state) {
			return;
		}
		if (!channel_state.lunch_state) {
			return;
		}
		if (channel_state.lunch_state.state == 'idle') {
			return;
		}
		bot.reply(message, "Got it. I'm abandoning the current lunch ->");
		bot.reply(message, JSON.stringify(channel_state.lunch_state));
		channel_state.lunch_state = new LunchState();
		saveChannelState(channel_state, function(err, id) {});
	});
});

controller.hears(['what are we doing'], 'direct_message,direct_mention,mention', function(bot, message) {
	getChannelState(message.channel, function(err, channel_state) {
		if (!channel_state) {
			return;
		}
		if (!channel_state.lunch_state) {
			return;
		}
		lunch_state = channel_state.lunch_state;
		bot.reply(message, "We're in the lunch state " + lunch_state.state);
		bot.reply(message, "The following people are in for lunch: ");
		for (whos_in in lunch_state.whos_in) {
			user = lunch_state.whos_in[whos_in].userName;
			bot.reply(message, user);
		}
		bot.reply(message, "The following people drove in:");
		for (who_drove in lunch_state.who_drove) {
			drove_state = lunch_state.who_drove[who_drove];
			bot.reply(message, drove_state.user.userName + " and can take " + drove_state.how_many);
		}
		bot.reply(message, "We have the following restaurants left in the veto list:" + lunch_state.restaurants_left.join("|"));
	});
});

controller.hears(['add restaurant'], 'direct_message,direct_mention,mention', function(bot, message) {
	getChannelState(message.channel, function(err, channel_state) {
		if (!channel_state) {
			return;
		}
		if (!channel_state.restaurants) {
			channel_state.restaurants = {};
		}
		bot.api.users.info({user: message.user}, function(err, userInfo) {
			userId = message.user;
			userName = userInfo.user.name;
			console.log("Start convo");
			console.log(JSON.stringify(message));
			bot.startConversation(message, function(response, convo) {
				console.log("in convo");
				convoAddRestaurantGimmeName(userName, channel_state, response, convo);
			});
		});
	});
});

convoAddRestaurantGimmeName = function(whos_talking, channel_state, response, convo) {
	console.log("Got response1");
	convo.ask("Okay, " + whos_talking + ". What is the name of the new restaurant?", function(response, convo) {
		restaurantName = response.text;
		if (channel_state.restaurants[restaurantName]) {
			convo.say("The restaurant " + restaurantName + " already exists. Please name a new restaurant");
			convo.repeat();
			convo.next();
			return;
		}
		convoAddRestaurantRequiresDriving(whos_talking, restaurantName, channel_state, response, convo);
		convo.next();
	});
	
}

convoAddRestaurantRequiresDriving = function(whos_talking, restaurant_name, channel_state, response, convo) {
	convo.ask("Okay, " + whos_talking + ". Does " + restaurant_name + " require a car to get to?", function(response, convo) {
		requiresCar = response.text;
		gotYes = bot.utterances.yes.test(requiresCar);
		gotNo = bot.utterances.no.test(requiresCar);
		if (!gotYes && !gotNo) {
			convo.say("Sorry, I didn't understand that.");
			convo.repeat();
		}
		else
		{
			convo.say("Got it! I'm going to add the restaurant " + restaurant_name + " and it " + (gotYes ? "does" : "doesn't") + " require driving");
			newRestaurant = new Restaurant(restaurant_name, gotYes);
			channel_state.restaurants[restaurant_name] = newRestaurant;
			saveChannelState(channel_state, function(err, id) {
				
			});
		}
		convo.next();
	});
	
}

controller.hears(['show restaurants'], 'direct_message,direct_mention,mention', function(bot, message) {
	bot.reply(message, "Okay! These are all of the restaurants I know about.");
	getChannelState(message.channel, function (err, channel_state) {
		if (!channel_state || !channel_state.restaurants) {
			bot.reply(message, "I don't know about any restaurants. Please tell me about restaurants with 'add restaurant'");
			return;
		}
		for (restaurant in channel_state.restaurants) {
			restaurant_info = channel_state.restaurants[restaurant];
			bot.reply(message, "There's one called " + restaurant + " that " + (restaurant_info.requires_car ? "does" : "doesn't" ) + " require a car");
		}
	});
});

controller.hears(['hello','hi'],'direct_message,direct_mention,mention',function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    },function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(',err);
        }
    });


    controller.storage.users.get(message.user,function(err, user) {
        if (user && user.name) {
            bot.reply(message,'Hello ' + user.name + '!!');
        } else {
            bot.reply(message,'Hello.');
        }
    });
});

controller.hears(['call me (.*)'],'direct_message,direct_mention,mention',function(bot, message) {
    var matches = message.text.match(/call me (.*)/i);
    var name = matches[1];
    controller.storage.users.get(message.user,function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        user.name = name;
        controller.storage.users.save(user,function(err, id) {
            bot.reply(message,'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['what is my name','who am i'],'direct_message,direct_mention,mention',function(bot, message) {

    controller.storage.users.get(message.user,function(err, user) {
        if (user && user.name) {
            bot.reply(message,'Your name is ' + user.name);
        } else {
            bot.reply(message,'I don\'t know yet!');
        }
    });
});


controller.hears(['shutdown'],'direct_message,direct_mention,mention',function(bot, message) {

    bot.startConversation(message,function(err, convo) {
        convo.ask('Are you sure you want me to shutdown?',[
            {
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    convo.say('Bye!');
                    convo.next();
                    setTimeout(function() {
                        process.exit();
                    },3000);
                }
            },
        {
            pattern: bot.utterances.no,
            default: true,
            callback: function(response, convo) {
                convo.say('*Phew!*');
                convo.next();
            }
        }
        ]);
    });
});


controller.hears(['uptime','identify yourself','who are you','what is your name'],'direct_message,direct_mention,mention',function(bot, message) {

    var hostname = os.hostname();
    var uptime = formatUptime(process.uptime());

    bot.reply(message,':robot_face: I am a bot named <@' + bot.identity.name + '>. I have been running for ' + uptime + ' on ' + hostname + '.');

});

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}
