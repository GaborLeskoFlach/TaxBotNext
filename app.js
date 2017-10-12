/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var speechTextLib = require('./store/speechTextLibrary')
var ssml = require('./ssml');

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    stateEndpoint: process.env.BotStateEndpoint,
    openIdMetadata: process.env.BotOpenIdMetadata 
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot. 
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector);

bot.on('conversationUpdate', (message) => {
    if (message.membersAdded) {
        message.membersAdded.forEach((identity) => {
            if (identity.id === message.address.bot.id) {
                bot.beginDialog(message.address, '/');
            }
        })
    }
})

bot.dialog('/', [
    function (session) {
        builder.Prompts.text(session, "Hello... What's your name?", {
            speak: 'Hello... What is your name?',
            retrySpeak: 'Still here, please talk to me',
            inputHint: builder.InputHint.expectingInput
        });
    },
    function (session, results) {
        session.userData.name = results.response;
        builder.Prompts.number(session, "Hi " + results.response + ", How many years have you been coding?", {
            speak :  `Hi ${results.response} How many years have you been coding?`,
            retrySpeak: 'Still here, please talk to me',
            inputHint: builder.InputHint.expectingInput            
        }); 
    },
    function (session, results) {
        session.userData.coding = results.response;
        builder.Prompts.choice(session, 'What language to code Node you are using?', ["JavaScript","CoffeeScript","TypeScript"], {
            listStyle: builder.ListStyle.button ,
            speak: 'What language to code Node you are using?'
        });
    },
    function (session, results) {
        session.userData.language = results.response.entity;
        session.say(`Got it... ${session.userData.name} you've been programming for ${session.userData.coding} years and use ${session.userData.language}`,
        `Got it... ${session.userData.name} you've been programming for ${session.userData.coding} years and use ${session.userData.language}`);
    }
])

