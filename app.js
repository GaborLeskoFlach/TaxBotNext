/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var speechTextLib = require('./store/speechTextLibrary')
var ssml = require('./ssml');
var fetch = require('node-fetch')

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
                bot.beginDialog(message.address, 'menu');
            }
        })
    }
})

bot.on('error', (e) => {
    bot.beginDialog('error', e)
})

bot.dialog('/', [
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
        session.beginDialog('this_is_the_end')
    }  
])

bot.dialog('greetings', [
    (session) => {        
        builder.Prompts.text(session, speechTextLib.welcome_what_is_your_name, {
            speak: speechTextLib.welcome_what_is_your_name,
            retrySpeak: speechTextLib.welcome_still_waiting_for_input,
            inputHint: builder.InputHint.acceptingInput
        }) 
    },
    (session, results, next) => {
        if(results.response){
            const fullName = results.response
            let nameParts = fullName.split(' ')
            session.userData.username = fullName
                                    
            session.userData.firstName = nameParts[0] ? nameParts[0] : ''
            session.userData.lastName = nameParts[1] ? nameParts[1] : ''
        }
        session.beginDialog('set_email')
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
            builder.Prompts.text(session, `${session.userData.firstName} please provide a valid email address so I can proceed.`, {
                speak: `${session.userData.firstName} please provide a valid email address so I can proceed.`,
                retrySpeak: 'Still here, waiting for your input',
                inputHint: builder.InputHint.expectingInput                    
            });
        }
    },
    (session, results) => {

        const matched = isValidEmail(results.response)
        //const matched = true
        if (matched) {
            //var email = matched ? matched.join('') : '';
            const email = "test@test.com"
            
            session.userData.email = email; // Save the number.
            session.say('Sweet','Sweet bananas')
            session.beginDialog('nominatedFor_selector')
        } else {
            // Repeat the dialog
            //session.replaceDialog('set_email', { reprompt: true });
            session.say("Unfortunately I have no idea why I cannot accept a perfectly normal email address. Anyways, let's just continue",
            "Unfortunately I have no idea why I cannot accept a perfectly normal email address. Anyways, let's just continue")
            session.beginDialog('nominatedFor_selector')
        }
    }
])

bot.dialog('nominatedFor_selector', [
    (session, results) => {
        session.say('Please bear with me till I gather some data','Please bear with me till I gather some data')
        
        getAwards().then((response) => {
            session.userData.nominationChoices = response
            if(session.userData.nominationChoices){
                builder.Prompts.choice(session, `All done, now please select or say which option you would like me to proceed with?`, session.userData.nominationChoices, {
                    listStyle: builder.ListStyle.button ,
                    speak: 'All done, now please select or say which option you would like me to proceed with',
                    inputHint: builder.InputHint.expectingInput
                })              
            }
        })

    },
    (session, results) => {
        session.userData.activity = results.response.entity;
        const choices = session.userData.nominationChoices
        const activity = choices.find(x => x.value === session.userData.activity).action.title

        session.userData.nominatedFor = activity

        builder.Prompts.text(session, `Got it... ${session.userData.firstName} you've selected ${activity}. Is this correct? (yes/no) `, {
            speak : `Got it... ${session.userData.firstName} you've selected ${activity}. Is this correct? Please say Yes or No`,
            retrySpeak : 'I am still here and waiting for your input',
            inputHint: builder.InputHint.expectingInput
        })                   
    },
    (session, results) => {
        //API Call
        if(results.response.toLowerCase() === 'yes'){
            session.beginDialog('nominee_type')
        }else{
            session.replaceDialog('this_is_the_end')
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
        session.beginDialog('nominee_name')
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
        session.beginDialog('nominate')
    }
])

bot.dialog('nominate', [
    (session, args, next) => {

        session.say(
            `Here is the summary of the data I've collected.`,
            `Here is the summary of the data I've collected.`
        )

        var card = createHeroCard(session)
        var msg = new builder.Message(session)
            //.speak(speak(session, 'Please say Nominate or click the Nominate button'))
            .inputHint(builder.InputHint.acceptingInput) // Tell Cortana to accept input
            .addAttachment(card);
        session.send(msg)

        builder.Prompts.confirm(session, "Are you sure you wish to proceed with the Nomination?",{
            speak: "Are you sure you wish to proceed with the Nomination?",
            retrySpeak: "Still here waiting for your input",
            inputHint: builder.InputHint.expectingInput
        });
    },
    (session, result, next) => {
        if(result.response === true){

            nominate().then((response) => {
                //session.say('All done, good job', 'All done, good job')
                //session.replaceDialog('menu')
                builder.Prompts.confirm(session, "All done, nomination has been posted. Is there anything else I can help you with?", {
                    speak: "All done, nomination has been posted. Is there anything else I can help you with?",
                    retrySpeak: "Still here waiting for your input",
                    inputHint: builder.InputHint.expectingInp                    
                });
            }).catch((err) => {
                session.say('Oops, something went wrong', 'Oops, something went wrong')
                session.replaceDialog('menu')
            })

        }else{
            next()
        }
    },
    (session, results) => {
        if(results.response === true){
            session.replaceDialog('menu')
        }else{
            session.endConversation(`See you another day ${session.userData.username}`, {
                speak : 'Bye bye'
            })
        }
    } 
])

bot.dialog('menu', [
    (session, args) => {

        session.say(
            "Hi, I'm a Virtual Bot Assistant to help with nominating individuals/teams for awards",
            "Hi, I'm a Virtual Bot Assistant to help with nominating individuals/teams for awards")

        builder.Prompts.choice(session, 'Here is a list of things I can help you with', supportedFunctions, {
            listStyle: builder.ListStyle.button ,
            speak: 'Here is a list of things I can help you with. Please select one'
        });        
    },
    (session, results) => {
        if(results.response.entity){
            switch(results.response.entity){
                case "0":
                    session.replaceDialog('quick_nomination')
                    break                
                case "1":
                    session.replaceDialog('greetings')
                    break
                case "2":
                    session.replaceDialog('get_my_nominations')
                    break
                case "3":
                    session.replaceDialog('get_all_users_to_nominate')
                    break
                case "4":
                    session.replaceDialog('get_all_awards')
                    break
                case "5":
                    session.replaceDialog('help')
                    break                    
                default:
                    session.replaceDialog('menu')
            }
        }
    }
]).triggerAction({ matches: /menu/i });

bot.dialog('quick_nomination', [
    (session) => {

        builder.Prompts.text(session, "Please say in one sentence who you would like to nominate for what award", {
            speak: "Please say in one sentence who you would like to nominate for what award",
            retrySpeak: speechTextLib.welcome_still_waiting_for_input,
            inputHint: builder.InputHint.acceptingInput
        })
    },
    (session,results) => {
        if(results.response){
            
            const text = results.response
            const temp = text.toLowerCase().replace('i would like to nominate','').replace("i'd like to nominate")
            const username = temp.substring(0, temp.indexOf('for')).trim()
            const award = temp.toLowerCase().replace(username,'').replace('for','').trim()

            if(username && award){
                builder.Prompts.confirm(session, "You can also post a message along with your nomination. It is optional. Would you like to do that?",{
                    speak: "You can also post a message along with your nomination. It is optional. Would you like to do that?",
                    retrySpeak: "Still here waiting for your input",
                    inputHint: builder.InputHint.expectingInput
                });    
            }else{

            }

            //session.say(`User to nominate for ${award} is ${username}`)
        }
    },
    (session, results) => {
        if(results.response === true){
            builder.Prompts.text(session, "Please write your message", {
                speak: "Please say your message",
                retrySpeak: speechTextLib.welcome_still_waiting_for_input,
                inputHint: builder.InputHint.acceptingInput
            })         
        }else{
            session.say('Nomination is done')
        }
    },
    (session, results) => {
        if(results.response){
            session.say('Thanks. Posting Nomination now...','Thanks. Posting Nomination now...')

            nominate(session).then((response) => {
                builder.Prompts.confirm(session, "All done, nomination has been posted. Is there anything else I can help you with?", {
                    speak: "All done, nomination has been posted. Is there anything else I can help you with?",
                    retrySpeak: "Still here waiting for your input",
                    inputHint: builder.InputHint.expectingInp                    
                });                
            }).catch((err) => {
                session.say('Oops, something went wrong', 'Oops, something went wrong')
                session.replaceDialog('menu')
            })
        }
    },
    (session, results) => {
        if(results.response === true){
            session.replaceDialog('menu')
        }else{
            session.endConversation(`See you another day ${session.userData.username}`, {
                speak : 'Bye bye'
            })
        }
    }     
])

bot.dialog('get_my_nominations', [
    (session, args) => {
        session.say('These are all your nominations', 'There are all your nominations')
    }
])

bot.dialog('get_all_users_to_nominate', [
    (session, args) => {
        session.say('These are all the users to nominate','These are all the users to nominate')
    }
])

bot.dialog('get_all_awards',[
    (session, args) => {
        session.say('These are the available awards to pick from','These are the available awards to pick from')
    } 
])

bot.dialog('error', [
    (session, args) => {
        session.say(`Oops something went wrong => ${e}`, `Ooops something went wrong!`)
    }
])

bot.dialog('this_is_the_end', [
    (session, args) => {
        session.say(`It's been an absolute pleasure ${session.userData.firstName}. Have an awesome day!`,
        `It's been an absolute pleasure ${session.userData.firstName}. Have an awesome day!`)
    }
])

/**
 * Every bot should have a help dialog. Ours will use a card with some buttons
 * to educate the user with the options available to them.
 */
bot.dialog('help', function (session) {
    var card = new builder.HeroCard(session)
        .title("I'm here to help")
        .buttons([
            builder.CardAction.imBack(session, 'nominate', 'Nominate'),
        ]);
    var msg = new builder.Message(session)
        .speak(speak(session, "Say nominate if you would like to nominate a team or individual for an award"))
        .addAttachment(card)
        .inputHint(builder.InputHint.acceptingInput);
    session.send(msg).endDialog();
}).triggerAction(
    { 
        matches: /help/i          
    });

/*********************************** HELPERS ************************************/

var supportedFunctions = [
    { value: '0', action: { title: 'Quick Nomination' }, synonyms: 'zero|null|quick nomination|nomination|quicky|quick one' },
    { value: '1', action: { title: 'Nominate a Team or Individual for an award' }, synonyms: 'one|nominate|nominate a team|nominate an individual|nominate for award' },
    { value: '2', action: { title: 'Get my nominations' }, synonyms: 'two|too|get nominations|get my nominations|my nominations' },
    { value: '3', action: { title: 'Get all users to nominate' }, synonyms: 'three|tree|get users|get all users|get users to nominate|get all users to nominate' },
    { value: '4', action: { title: 'Get awards' }, synonyms: 'four|for|get all awards|get awards' },
    { value: '5', action: { title: 'Help' }, synonyms: 'five|help|need help|I need help|save me' },
]

function createHeroCard(session) {

    const who = session.userData.username
    const nomineeType = session.userData.nomineeType
    const nominee = session.userData.nominee
    const nominatedFor = session.userData.nominatedFor

    return new builder.HeroCard(session)
        .title('Summary')
        .subtitle('View the collected information')
        .text(`${who} has nominated ${nomineeType} ${nominee} for ${nominatedFor}`)
        /*
        .buttons([
            builder.CardAction.imBack(session, 'nominate', 'Nominate'),
        ]);*/
}

function getNomineeType(){
    return new Promise((resolve,reject) => {
        const choices = [
            { value: '1', action: { title: 'Team' }, synonyms: 'one|team' },
            { value: '2', action: { title: 'Individual' }, synonyms: 'two|individual' },            
        ]
        setTimeout(() => resolve(choices), 3000);       
    })
       
}

function getAwards(){    
    return new Promise((resolve,reject) => {

        /*
        var choices = [
            { value: '1', action: { title: 'Nominate for Cleanest Desk award' }, synonyms: 'one|cleanest desk award' },
            { value: '2', action: { title: 'Nominate for Cleanest Mug award' }, synonyms: 'two|too|cleanest mug award' },
            { value: '3', action: { title: 'Nominate for Cleanest Keyboard award' }, synonyms: 'three|tree|cleanest keyboard award' },
            { value: '4', action: { title: 'Nominate for Cleanest Screen award' }, synonyms: 'four|for|cleanest screen award' },
        ]
    
        setTimeout(() => resolve(choices), 3000);
        */

        fetch('http://xlw-cnd70778yz.inside.xero.com/api/awards', 
        { 
            method: 'GET', 
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        })
        .then((res) => {
            return res.json();
        }).then((json) => {
            resolve(json)
        }).catch((err) => {            
            reject(err)
        })


    })
}

function nominate(entity){
    return new Promise((resolve, reject) => {

        var body = {
            awardId : entity.awardId,
            awardNomineeId : entity.awardNomineeId,
            message : entity.message,
            labels : entity.label
        }

        var z = JSON.stringify(body)
        console.log(JSON.stringify(body))

        fetch('http://xlw-cnd70778yz.inside.xero.com/api/votes', 
        { 
            method: 'POST', 
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        })
        .then((res) => {
            return res.json();
        }).then((json) => {
            resolve(true)
        }).catch((err) => {            
            reject(err)
        })

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


