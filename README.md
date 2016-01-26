# slack-lunch-bot

A bot for organizing lunch in Slack

## Starting lunch-bot

The easiest way is to install git bash, from the Git Windows tools, and Node.js.

Then, from git-bash, cd to the directory with bot.js in it, and run

```shell
npm install
```

```shell
token=<yourBotTokenFromSlack> node bot.js
```


## Playing with lunch-bot
From inside your Slack channel, /invite him into a channel. From there, you may initiate a lunch converstion by stating 'lets have lunch'. He'll begin a role call at that moment.

If, at any moment, you are confused about the available commands, you may inform lunch-bot that "i'm confused" and he will list all available commands based on his current state (and what those commands will do).

## Adding additional states to lunch-bot
StateModules should export a class with 3 fields:
```JavaScript
modules.exports = {
		states: statesToExport,
		transitions: transitionsToExport,
		globalEvents: globalEventsToExport
}
```

When you import that module through a ```require()``` function call, you may then add that module to the list of all stateModules. All of the states, transitions and global listeners will then be registered.

### StateEventHandlers
StateEventHandlers are created by creating a new StateMachine.StateEventHandler(). The constructor prototype looks like this:
```JavaScript
StateEventHandler(phrasesToListenFor:array, onPhraseHeardCallback, helpText);
```
```phrasesToListenFor``` is an array of strings of phrases that lunch-bot will listen for. 
When a phrase is heard, he will call onPhraseHeardCallback. 
Finally, the ```helpText``` is displayed whenever a user types "i'm confused" and lunch-bot is in a state to be listening for events for your StateEventHandler
```JavaScript
var onPhraseHeardCallback = function(bot, message, channelState, stateManager) {}
```
And your callback should return the channelState (especially if you modified it).
The bot is the passed in botkit api. 
The message is the message lunch-bot is currently responding to.
The channelState is the currently saved persistent channel state.
The stateManager is the state machine manager for lunch-bot. 