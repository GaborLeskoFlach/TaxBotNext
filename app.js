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

bot.on('error', (e) => {
    bot.beginDialog('error', e)
})

bot.dialog('/', [
    (session, args, next) => {
        session.say('This is a Bot Assistant to help with nominating individuals/teams for awards','This is a Bot Assistant to help with nominating individuals/teams for awards')
        next()
    },
    (session, args, next) => {        
        session.beginDialog('greetings')              
    },
    (session, args, next) => {
        session.beginDialog('set_email')
    },  
    (session, args, next) => {
        session.beginDialog('nominatedFor_selector')
    },
    (session, args, next) => {
        session.beginDialog('nominee_type')
    },
    (session, args, next) => {
        session.beginDialog('nominee_name')
    },
    (session, args, next) => {
        session.beginDialog('nominate')
    },
    (session, args) => {
        session.endConversation("Thanks, it has been a pleasure")
    }  
])

bot.dialog('greetings', [
    (session) => {
        builder.Prompts.text(session, speechTextLib.welcome_what_is_your_name, {
            speak: speechTextLib.welcome_what_is_your_name,
            retrySpeak: speechTextLib.welcome_still_waiting_for_input,
            inputHint: builder.InputHint.expectingInput
        }) 
    },
    (session, results) => {
        if(results.response){
            session.userData.username = results.response;
            session.say(`Sweet`,`Sweet`)
        }
        
        session.endDialog()
    },    
])

bot.dialog('set_email', [
    (session, args) => {
        if (args && args.reprompt) {
            builder.Prompts.text(session, "Oops, looks like it's invalid, try again.", {
                speak: 'Oops, looks like it is invalid, try again.',
                retrySpeak: 'Still here, waiting for your input',
                inputHint: builder.InputHint.expectingInput                
            })
        } else {
            builder.Prompts.text(session, `${session.userData.username} please provide a valid email address so I can proceed.`, {
                speak: `${session.userData.username} please provide a valid email address so I can proceed.`,
                retrySpeak: 'Still here, waiting for your input',
                inputHint: builder.InputHint.expectingInput                    
            });
        }
    },
    (session, results) => {

        //const matched = isValidEmail(results.response)
        const matched = true
        if (matched) {
            //var email = matched ? matched.join('') : '';
            const email = "test@test.com"
            
            session.userData.email = email; // Save the number.
            session.say('Thank you','Thank you')
            session.endDialog()
        } else {
            // Repeat the dialog
            session.replaceDialog('set_email', { reprompt: true });
        }
    }
])

bot.dialog('nominatedFor_selector', [
    (session, results) => {
        session.say('Please wait a second till I gather some data','Please bear with me till I gather some data')
        
        getNominationCategories().then((response) => {
            session.userData.nominationChoices = response
            if(session.userData.nominationChoices){
                builder.Prompts.choice(session, `All done, now please select/say which option you would like me to proceed with?`, session.userData.nominationChoices, {
                    speak: 'All done, now please select/say which option you would like me to proceed with'
                })              
            }
        })

    },
    (session, results) => {
        session.userData.activity = results.response.entity;
        const choices = session.userData.nominationChoices
        const activity = choices.find(x => x.value === session.userData.activity).action.title

        session.userData.nominatedFor = activity

        builder.Prompts.text(session, `Got it... ${session.userData.username} you've selected ${activity}. Is this correct? (yes/no) `, {
            speak : `Got it... ${session.userData.username} you've selected ${activity}. Is this correct? Please say Yes or No`,
            retrySpeak : 'I am still here and waiting for your input',
            inputHint: builder.InputHint.expectingInput
        })                   
    },
    (session, results) => {
        //API Call
        if(results.response.toLowerCase() === 'yes'){
            session.endDialog()
        }        
    }   
])

bot.dialog('nominee_type', [
    (session, args, next) => {

        getNomineeType().then((response) => {
            builder.Prompts.choice(session, 'Are you nominating a Team or and Individual?', response, {
                listStyle: builder.ListStyle.button ,
                speak: 'Are you nominating a Team or an Individual?'
            });
        })
    },
    (session, args, next) => {
        if(args.response){
            session.userData.nomineeType = args.response.entity
        }
        session.endDialog()
    }
])

bot.dialog('nominee_name', [
    (session, args, next) => {
        let question = ''

        switch(session.userData.nomineeType){
            case '1':
                question = 'What is the name of the team you would like to nominate?'
                break
            case '2':
                question = 'What is the name of the person you would like to nominate?'
                break
        }

        builder.Prompts.text(session,question, {
            speak: question,
            retrySpeak: question,
            inputHint: builder.InputHint.expectingInput
        })        
    },
    (session, results) => {
        if(results.response){
            session.userData.nominee = results.response
        }
        session.endDialog()
    }
])

bot.dialog('nominate', [
    (session, args, next) => {

        const who = session.userData.username
        const nomineeType = session.userData.nomineeType
        const nominee = session.userData.nominee
        const nominatedFor = session.userData.nominatedFor

        var card = new builder.HeroCard(session)
            .title('Nomation')
            .subtitle(`${who} nominated ${nominee} for ${nominatedFor}`)
            .buttons([
                builder.CardAction.imBack(session, 'nominate', 'Nominate')
            ]);
        var msg = new builder.Message(session)
            .speak('Say something dude')
            .addAttachment(card)
            .inputHint(builder.InputHint.acceptingInput); // Tell Cortana to accept input
        
        session.send(msg)
    },
    (session, results) => {
        console.log('hello')
    }
])

bot.dialog('error', [
    (session, args) => {
        session.say(`Oops something went wrong => ${e}`, `Ooops something went wrong!`)
    }
])

function getNomineeType(){
    return new Promise((resolve,reject) => {
        const choices = [
            { value: '1', action: { title: 'Team' }, synonyms: 'one|team' },
            { value: '2', action: { title: 'Individual' }, synonyms: 'two|individual' },            
        ]
        setTimeout(() => resolve(choices), 3000);       
    })
       
}

function getNominationCategories(){
    return new Promise((resolve,reject) => {
        var choices = [
            { value: '1', action: { title: 'Nominate for Cleanest Desk award' }, synonyms: 'one|cleanest desk award' },
            { value: '2', action: { title: 'Nominate for Cleanest Mug award' }, synonyms: 'two|too|cleanest mug award' },
            { value: '3', action: { title: 'Nominate for Cleanest Keyboard award' }, synonyms: 'three|tree|cleanest keyboard award' },
            { value: '4', action: { title: 'Nominate for Cleanest Screen award' }, synonyms: 'four|for|cleanest screen award' },
        ]
    
        setTimeout(() => resolve(choices), 3000);        
    })
}

function isValidEmail(value){
    var matched = value.match(/[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/g);
    return matched
}

/** Helper function to wrap SSML stored in the prompts file with <speak/> tag. */
function speak(session, prompt) {
    var localized = session.gettext(prompt);
    return ssml.speak(localized);
}