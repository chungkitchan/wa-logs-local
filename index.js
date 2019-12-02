'use strict';

require('dotenv').config({ silent: true });
const toBoolean = require('to-boolean'),
      csv       = require('fast-csv'),
      _         = require('lodash'),
      cheerio   = require('cheerio'),
      fs        = require('fs');

const showInfo = process.env.CONSOLE_INFO? toBoolean(process.env.CONSOLE_INFO): true;
require('console-stamp')(console, {pattern: 'dddd dd mmm yyyy hh:MM:ss.l tt',
                                   disable: showInfo?[]:["info"],
                                   colors: { stamp: 'yellow', label: 'white', metadata: 'green' }});       // for LOG TIMESTAMP

const rptType = process.env.TYPE || 'CLOUDANT';
const cloudantUrl = process.env.CLOUDANT_URL || null;
const dbName = process.env.LOG_DBNAME || null;
const start = process.env.START_DATE || null;
const end = process.env.END_DATE || null;
const filename = process.env.CSV_FILENAME || 'usage.csv';
const greeting = process.env.INCLUDE_GREETING? toBoolean(process.env.INCLUDE_GREETING) : false;
var nano = null;

if (rptType == 'CLOUDANT') {
   if (!cloudantUrl || !dbName) {
       console.error('Cannot find CLOUDANT_URL or LOG_DBNAME, please specific in .env file and try again...');
       process.exit();
   }
   getCloudantLog(cloudantUrl, dbName, start, end, greeting, filename);
}
// const env = process.env;
// console.log("ENV: ",JSON.stringify(env,null,2));


async function getCloudantLog(cloudantUrl, dbName, start, end, greeting, filename) {
    var db = null;
    try {
        console.log("Trying to connect to cloudant with URL: %s, DB: %s", cloudantUrl,dbName);
        db = await connectCloudant(cloudantUrl, dbName);
        extractCloudantLog(db, start, end, greeting, filename);
    }   catch(e)  {
        console.error('Encounter error: ',e);
        console.error('Please try again later...');
    }
}

function connectCloudant(cloudantUrl, dbName) {
    return new Promise(function (resolve, reject) {
        try {
            nano = require('nano')(cloudantUrl);
            nano.db.get(dbName, function (err) {
                if (err) {
                   console.error('Failed to connect to cloudant db: %s, error: ',dbName,err);
                   reject(err);
                }  else {
                    var db = nano.db.use(dbName);
                    if (!db) {
                       console.error('nano.db.use(%s) failed to connect, return null ',dbName);
                       reject(new Error("nano.db.use(dbName) return null!!"));
                    }  else {
                       console.log('Successfully connected to cloudant db: %s',dbName);
                       resolve(db);
                    }
                }
            });
        } catch (e) {
            console.error('Failed to connect to cloudant db: %s, error: ',dbName,e);
            reject(e);
        }
    });
}

function extractCloudantLog(logs, start, end, greeting, filename) {
    console.info("Extracting Log, start date: %s, end date: %s, %s greeting to csv filename: %s",start, end, greeting==true? 'include':'exclude', filename);
    var doDateFilter = false;
    var startDate = start ? new Date(start) : null;
    var endDate = end ? new Date(end) : null;
    if (startDate && endDate && validDateRange(startDate, endDate)) doDateFilter = true;
    try {
        var design_doc = null;
        var view = null;
        if (!greeting) {
            design_doc = 'log_time_inputtext';
            view = 'by_time_inputtext';
        }  else  {
            design_doc = 'log_time';
            view = 'by_time' ;
        }
        if (doDateFilter) {
            console.info("In extractCloudantLog(), extracting logs from %s to %s, calling logs.view(%s), %s...",startDate, endDate, design_doc, greeting==true?'including greeting':'excluding greeting');
            logs.view(design_doc, view, {
                startkey: startDate,
                endkey: endDate,
                include_docs: true
            }, function (err, body) {
                if (!err) {
                    console.info("Extracted from cloudant DB, total_rows: %d, rows.length: %d", body.total_rows,body.rows? body.rows.length:0);
                    storeToCSV(body, filename);
                } else {
                    console.error('In extractCloudantLog() encounter exception:', err );
                }
            })
        } else {
            console.info("In extractCloudantLog(), extracting all logs by calling logs.view(%s), %s...",design_doc,  greeting==true?'including greeting':'excluding greeting');
            logs.view(design_doc, view, { include_docs: true }, function(err,body) {
                if (!err) {
                    console.info("Extracted from cloudant DB, total_rows: %d, rows.length: %d", body.total_rows,body.rows? body.rows.length:0);
                    storeToCSV(body, filename);
                } else {
                    console.error('In extractCloudantLog() encounter exception:', err );
                }
            });
        }
    }   catch (err) {
        console.error('In extractCloudantLog(), encounter exception:', err);
    }
}

function storeToCSV(body,filename) {
    console.log("In storeCSV(), log has total %d rows, extracting %d rows to csv filename: %s", body.total_rows, body.rows.length, filename);
    var csvStream = csv.format({headers: true});
    var writeStream = fs.createWriteStream(filename); 
    csvStream.pipe(writeStream)
             .on('error',function(err){console.error('Encounter error while writting to straem, error: ',err); })
             .on('end',function(){console.info('Completed writting to stream...');});
    // csv.push( ['ConversationId','QuestionId','Question', 'Intent', 'Confidence', 'Entity', 'Output','Time','Rating','User Comment','Survey 1 (helpfulness)','Survey 1 (comment)','Survey 2 (call deflected)','Survey 2 (comment)', 'Survey 3 (Rating: 1-very dissatisfied, 6-very satisfied)', 'Survey 4 (comment)'] );
    csvStream.write(['sessionId', 'questionId', 'question', 'intent', 'confidence', 'entity', 'answer', 'time', 'rating', 'userComment', 
                     'source', 'userid', 'userName','request','output json','debug','log messages','skills context','tone','discovery','apple',
                     'microsoft','global context','_id','JSON']);
    try {
        var memUsed = memoryCheck('Before processing each row using forEach()');
        body.rows.forEach(function (row, index) {
            // console.log('debug','%s',JSON.stringify(row,null,2));
            try {
                if (index % 5000 == 0) {
                    console.info('In storeToCSV(), processed %d rows...', index);
                }
                var conversationId = '';
                var questionId = '<no questionId>';
                var question = '';
                var intent = '';
                var confidence = 0;
                var time = '';
                var entity = '';
                var outputText = '';
                var rating = '';
                var comment = '';
                var source = 'web';
                var userid = '';
                var username = '';
                var rawData = '';
                var request = '';
                var output = '';
                var debug = '';
                var logMessages = '';
                var skillsContext = '';
                var globalContext = '';
                var tone='';
                var wds = '';
                var apple = '';
                var microsoft = '';
                var _id = '';
                if (row.doc && row.doc.response) {
                    output = JSON.stringify(row.doc.response.output, null, 2);
                    debug = JSON.stringify(row.doc.response.output.debug, null, 2);
                    logMessages = JSON.stringify(row.doc.response.output.log_messages, null, 2);

                    _id = row.doc.response.context && row.doc.response.context._id ? row.doc.response.context._id : '';
                    var doc = row.doc;
                    if (doc.request && doc.request.input) {
                        question = doc.request.input.text;
                        source = 'web';
                        userid = '';
                        username = '';
                    } else if (doc.message_received) {
                        source = 'skyeforbusiness';
                        if (doc.message_received.address && doc.message_received.address.user) {
                            userid = doc.message_received.address.user.id ? doc.message_received.address.user.id : '';
                            username = doc.message_received.address.user.name ? doc.message_received.address.user.name : '';
                        }
                        if (doc.response && doc.response.input && doc.response.input.text) {
                            question = doc.response.input.text;
                        }
                    }
                    // console.info("Deleting request.context.skills['main skill'].user_defined.discovery");
                    // delete doc.request.context.skills['main skill'].user_defined.discovery;
                    if (doc.request && doc.request.context && doc.request.context.skills && doc.request.context.skills['main skill'] &&
                        doc.request.context.skills['main skill'].user_defined && doc.request.context.skills['main skill'].user_defined.discovery
                /* && JSON.stringify(doc.request.context.skills['main skill'].user_defined.discovery).length>20000*/) {
                        // console.info('debug',"Deleting request.context.skills['main skill'].user_defined.discovery");
                        delete doc.request.context.skills['main skill'].user_defined.discovery;
                    }
                    request = JSON.stringify(row.doc.request, null, 2);
                    if (doc.response) {
                        intent = '<no intent>';
                        if (doc.response.output.intents && doc.response.output.intents.length > 0 && doc.response.output.intents[0].confidence) {
                            intent = doc.response.output.intents[0].intent;
                            confidence = Math.round(doc.response.output.intents[0].confidence * 100);
                        }  else if (doc.response.intents && doc.response.intents.length >0) {
                            intent = doc.response.intents[0].intent;
                            confidence = Math.round(doc.response.intents[0].confidence * 100);
                        }
                        entity = '<no entity>';
                        if (doc.response.output.entities && doc.response.output.entities.length > 0) {
                            entity = doc.response.output.entities.map(e => e.entity+' : '+e.value).join('\n');
                            // entity = doc.response.output.entities[0].entity + ' : ' + doc.response.output.entities[0].value;
                        }  else if (doc.response.entities && doc.response.entities.length > 0) {
                            entity = doc.response.entities.map(e => e.entity+' : '+e.value).join('\n');
                        }
                        outputText = '<no answer>';
                        if (doc.response.output && ((doc.response.output.text && doc.response.output.text.length>0) || 
                            (doc.response.output.generic && doc.response.output.generic.length > 0))) {
                            const output = extractAnswer(doc.response, false);
                            if (output && output != "" && output != undefined) {
                                outputText = output;
                            }
                        }
                        conversationId = '<no conversationId>'; //For Watson Assistant V2, we use session id
                        if (doc.request && doc.request.session_id) {
                            conversationId = doc.request.session_id;
                        } else if (doc.response.context && doc.response.context.session_id) {
                            conversationId = doc.response.context.session_id;
                        }
                        if (doc.response.context && doc.response.context.global && doc.response.context.global.system &&
                            (doc.response.context.global.system.turn_count || 'turn_count' in doc.response.context.global.system)) {
                            questionId = doc.response.context.global.system.turn_count;
                        }
                        if (doc.response.context && doc.response.context.skills) {
                            if (doc.response.context.skills['main skill'].user_defined.tone) {
                                tone = JSON.stringify(doc.response.context.skills['main skill'].user_defined.tone, null, 2);
                                delete doc.response.context.skills['main skill'].user_defined.tone;
                                doc.response.context.skills['main skill'].user_defined.tone="...";
                            }
                            if (doc.response.context.skills['main skill'].user_defined.discovery) {
                                wds = JSON.stringify(doc.response.context.skills['main skill'].user_defined.discovery, null, 2);
                                if (wds.length > 32760) {  // max size of single excel cell
                                    if (doc.response.context.skills['main skill'].user_defined.discovery.results) {
                                        for (let result of doc.response.context.skills['main skill'].user_defined.discovery.results) {
                                            result.enriched_description = "deleted...";
                                            result.enriched_title = "deleted...";
                                        }
                                        wds = JSON.stringify(doc.response.context.skills['main skill'].user_defined.discovery, null, 2);
                                    } else {
                                        wds = wds.substring(0, 32760);
                                    }
                                }
                                delete doc.response.context.skills['main skill'].user_defined.discovery;
                                doc.response.context.skills['main skill'].user_defined.discovery="...";
                            }
                            if (doc.response.context.skills['main skill'].user_defined.apple) {
                                apple = JSON.stringify(doc.response.context.skills['main skill'].user_defined.apple, null, 2);
                                delete doc.response.context.skills['main skill'].user_defined.apple;
                                doc.response.context.skills['main skill'].user_defined.apple="...";
                            }
                            if (doc.response.context.skills['main skill'].user_defined.microsoft) {
                                microsoft = JSON.stringify(doc.response.context.skills['main skill'].user_defined.microsoft, null, 2);
                                delete doc.response.context.skills['main skill'].user_defined.microsoft;
                                doc.response.context.skills['main skill'].user_defined.microsoft="...";
                            }
                            skillsContext = JSON.stringify(doc.response.context.skills, null, 2);
                            globalContext = JSON.stringify(doc.response.context.global, null, 2);
                        }
                    }

                    if (doc.feedback) {
                        if (doc.feedback.rating || rating in doc.feedback) {
                            // rating=(doc.feedback.rating==1?'&#128077;:thumbsup:':(doc.feedback.rating==-1?'&#128078;:thumbsdown:':''))
                            rating = (doc.feedback.rating == 1 ? ':thumbsup:' : (doc.feedback.rating == -1 ? ':thumbsdown:' : ''))
                        }
                        if (doc.feedback.comment) {
                            comment = doc.feedback.comment;
                        }
                    }
                    rawData = JSON.stringify(row.doc,null,2);
                    time = new Date(doc.time).toLocaleString("en-US", { timeZone: "Asia/Singapore" });
                    // csv.push([conversationId, questionId, question, intent, confidence, entity, outputText, time, rating, comment, source, userid, username]);
                    csvStream.write([conversationId, questionId, question, intent, confidence, entity, outputText, time, 
                                     rating, comment, source, userid, username, request, output, debug, logMessages, skillsContext, tone,
                                     wds, apple, microsoft, globalContext, _id, rawData]);
                }
            } catch (ex) {
                console.error('Encounter exceoption in storeToCSV() forEach()... error: ', ex);
                console.error('stack trace: ', ex.stack);

            }
        });
        memoryCheck('After processing, mem usage', memUsed);
    } catch (e) {
        console.error('Encounter exceoption in storeToCSV(), error: ', e);
        console.error('stack trace: ', e.stack);
    }
    console.log( "In storeToCSV() stream completed written to csv filename: %s with %d count.", filename, body.rows.length);
    csvStream.end();  
}

function memoryCheck(message,memUsageBefore=0) {
    gc();
    var memUsage = _.round(process.memoryUsage().heapUsed / 1024 / 1024, 2);
    if (memUsageBefore!=0) {
       memUsage = _.round(memUsage - memUsageBefore,2);
    }
    console.info(message+`: ${memUsage} MB`);
    
    return memUsage;
}

function validDateRange(start, end) {
    console.info("In validDateRange(), start: %s, end: %s",start, end);
    var valid = false;
    if (start && end && (!(start instanceof Date) || !(end instanceof Date))) {
       valid=false;
    }
    if (start && end && start < end) valid = true;
    return valid;
}

function extractAnswer(payload, transform = true) {
    var outputText = "";
    if (payload.output && payload.output.text) {
        if (typeof payload.output.text == "string") {
            outtputText = "";
        } else if (typeof payload.output.text == "object" && payload.output.text instanceof Array && payload.output.text.length>0 &&
                   typeof payload.output.text[0] == "string") {
            outputText = payload.output.text.join("\n");
        } else if (typeof payload.output.text == "object" && payload.output.text instanceof Array && payload.output.text.length>0 &&
                   typeof payload.output.text[0] == "object") {
            var output = [];
            for (const text of payload.output.text) {
                if (typeof text == "object") {
                   output.push(Object.values(text).join('\n'));
                }
            }   
            outputText = output.join('\n');
        } else {
            console.error("In extractAnser(), unknown output text type: %s, value: %s",typeof payload.output.text, JSON.stringify(payload.output.text));
        }
    }
    if (payload.output && payload.output.generic && payload.output.generic instanceof Array && payload.output.generic.length > 0) {
        if (payload.output.generic) {
            outputText = payload.output.generic.reduce((text, entry, index, arr) => {
                if (entry.response_type == "text") {
                    text += entry.text + (index == arr.length - 1 ? "" : "\n");
                } else if (entry.response_type == "option") {
                    var options = entry.options.reduce((opt, entry, index) => { opt += (index == 0 ? "[" : ",[") + entry.label + "]"; return opt; }, "");
                    text += (entry.title != "" ? "<" + entry.title + ">" : "") + options;
                }
                return text;
            }, "");
        }
    }
    if (transform) {
        var $ = cheerio.load(outputText);
        var text = $.text();                             // cheerio just remove tag, will not format the text
        // var text=htmlToFormattedText(html);         // htmlToFormattedText will convert <br> to \n ... etc
        outputText=text;
    }
    return outputText;
}
