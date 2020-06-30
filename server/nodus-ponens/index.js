// --------------------------------------------------------------------------------------------------
// Nodus Ponens: A Node.js package for rapid-prototyping high-level cognitive science and reasoning
// experiments.
// --------------------------------------------------------------------------------------------------
// Designed by Sangeet Khemlani
// Copyright (C) 2019 Naval Research Laboratory
// Navy Center of Applied Research in Artificial Intelligence
// https://www.nrl.navy.mil/itd/aic/
// --------------------------------------------------------------------------------------------------
// Contents:
// 0. Setting up the main experiment object, np, and creating a server instance
// 1. Initializing experiment (http://localhost/startExperiment)
// 2. Monitoring experiment session data (http://localhost/showSessionData)
// 3. Returning stimulus information (http://localhost/getNextStimulus)
// 4. Writing participant data to file (http://localhost/endExperiment)
// --------------------------------------------------------------------------------------------------

var dateFormat = require("dateformat");
var express = require('express');
var session = require('express-session');
var errorHandler = require('errorhandler')();
var json2csv = require('json2csv');      // This library will turn the JSON stimuli object into a CSV
var fs = require('fs');

function shuffle(array) {
   // Shuffle fn for Javascript
   // Retrieved from: http://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
   var currentIndex = array.length, temporaryValue, randomIndex;
   // While there remain elements to shuffle...
   while (0 !== currentIndex) {
      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;
      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
   }

   return array;
}

function logData(dataDirectory, sessionData) {
   var experimentData = JSON.parse(JSON.stringify(sessionData));
   var stimuliData = experimentData.Stimuli;
   delete experimentData.Stimuli;

   var fileName = dataDirectory + "/data-" + experimentData.ExperimentName + "-" + experimentData.ParticipantID
      + "-" + new Date().toISOString().slice(0, 10) + ".csv";

   var experimentCSV = json2csv({
      data: experimentData,
      fields: Object.keys(experimentData),
      eol: "\n"
   });
   // Write out experiment header information
   fs.writeFileSync(fileName, experimentCSV);

   var header = true;                                           // Write out trial information (only
   stimuliData.forEach(function (stimData)                        //    one header for all the trials)
   {
      var stimulusCSV = json2csv({
         data: stimData,
         fields: Object.keys(stimData),
         hasCSVColumnTitle: header, eol: "\n"
      });
      if (header) header = false;
      fs.appendFileSync(fileName, stimulusCSV);
   });
}


function setupNodusPonens(startingParticipantID, staticDirectory, dataDirectory) {
   // --------------------------------------------------------------------------------------------------
   // 0. Setting up the main experiment object, np, and creating a server instance
   // --------------------------------------------------------------------------------------------------

   var np = new Object();
   np["app"] = require('express')();
   np["http"] = require('http').Server(np.app);
   np["staticDirectory"] = staticDirectory;
   np["dataDirectory"] = dataDirectory;
   np["displayHeader"] = require("./displayHeader.js");
   np["authors"] = "Anonymous";
   np["experimentName"] = "XX0";
   np["port"] = "31337";
   np["randomize"] = shuffle;
   np["launchStudy"] = function () {
      np.app.listen(np.port);
      np.displayHeader(np.experimentName, np.authors, np.port);
   }

   if (startingParticipantID === undefined) { startingParticipantID = 0; }

   // Set session information to allow for multiple people to take study
   np.app.use(session({ secret: "Hume_1748", resave: false, saveUninitialized: true }));
   // Serve up *.html files from "static" folder
   np.app.use('/', express.static(np.staticDirectory));
   np.app.use(function (err, req, res, next) {
      if (app.get('env') === 'development') { return errorHandler(err, req, res, next); }
      else { res.sendStatus(401); }
   });
   np.participantID = startingParticipantID;
   np["updateParticipantID"] = function () { var pID = np.participantID; return np.participantID + 1; };
   np["loadStimuli"] = function () {
      return [{ "Experiment": np.experimentName, "DummyStimulus1": "DummyStimulusData1" },
      { "Experiment": np.experimentName, "DummyStimulus2": "DummyStimulusData2" },
      { "Experiment": np.experimentName, "DummyStimulus3": "DummyStimulusData3" }];
   }

   // --------------------------------------------------------------------------------------------------
   // 1. Initializing experiment
   // --------------------------------------------------------------------------------------------------

   np.app.get("/startExperiment", function (req, res) {
      res.header('Access-Control-Allow-Origin', '*')
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
      req.session.sessdata = {};
      Object.keys(require.cache).forEach(function (key) { delete require.cache[key] })
      var sess = req.session;
      sess.sessdata.ExperimentInformationHeader = "ExperimentInformation";
      np.participantID = np.updateParticipantID();
      sess.sessdata.ParticipantID = "P" + np.participantID;
      sess.sessdata.ExperimentName = np.experimentName;

      if (req.query.a) { sess.sessdata.Age = req.query.a; }           // Set experiment variables
      if (req.query.s) { sess.sessdata.Sex = req.query.s; }
      if (req.query.c) { sess.sessdata.Coursework = req.query.c; }
      if (req.query.l) { sess.sessdata.Language = req.query.l; }

      var today = new Date();
      sess.sessdata.StartTime = today.toISOString();
      sess.sessdata.CurrentStimulus = 0;
      //sess.sessdata.Stimuli           = np.loadStimuli(np.participantID);

      req.session = sess;
      console.log(dateFormat(today) + "   Set up experiment for " + sess.sessdata.ParticipantID + "...");
      res.json({ "Data": "Experiment session initialized", "Experiment": np.experimentName, "Time": today.toISOString() });
   });

   // --------------------------------------------------------------------------------------------------
   // 2. Monitoring data
   // --------------------------------------------------------------------------------------------------

   np.app.get("/showSessionData", function (req, res) { res.json(req.session.sessdata); });

   // --------------------------------------------------------------------------------------------------
   // 3. Returning stimulus information
   // --------------------------------------------------------------------------------------------------

   np.app.get("/getNextStimulus", function (req, res) {
      var sess = req.session;
      var nextStimulus = {};
      if (req.query.dumpQuery || !req.query.answer)        // If received signal to dump info or no info,
      {                                                                       // don't increment problem
         if (sess.sessdata.CurrentStimulus >= sess.sessdata.Stimuli.length)
            nextStimulus = { "Data": "Done" };
         else
            nextStimulus = sess.sessdata.Stimuli[sess.sessdata.CurrentStimulus];
      }
      else                                           // Else, if participant provided answer to problem, 
      {                                                  // log, then increment and provide next problem
         var currentStimulus = sess.sessdata.CurrentStimulus;
         if (currentStimulus >= 0 && currentStimulus < sess.sessdata.Stimuli.length
            && req.query.clockTime && req.query.answer && req.query.latency) {
            sess.sessdata.Stimuli[currentStimulus]["ClockTime"] = req.query.clockTime;
            sess.sessdata.Stimuli[currentStimulus]["Answer"] = req.query.answer;
            sess.sessdata.Stimuli[currentStimulus]["Latency"] = req.query.latency;
            sess.sessdata.Stimuli[currentStimulus]["TrialNumber"] = currentStimulus + 1;
            logData(np.dataDirectory + "/incomplete", sess.sessdata);
         }
         sess.sessdata.CurrentStimulus++;
         if (currentStimulus + 1 >= sess.sessdata.Stimuli.length)
            nextStimulus = { "Data": "Done" };
         else
            nextStimulus = sess.sessdata.Stimuli[currentStimulus + 1];
      }
      req.session = sess;
      res.json(nextStimulus);
   });

   // --------------------------------------------------------------------------------------------------
   // 4. Writing participant data to file
   // --------------------------------------------------------------------------------------------------

   np.app.get("/endExperiment", function (req, res) {
      var sess = req.session;
      var today = new Date();
      if (sess.sessdata)                                                  // Write session data to file,
      {                                                                        // then destroy session.
         sess.sessdata.EndTime = today.toISOString();
         logData(np.dataDirectory, sess.sessdata);
         console.log(dateFormat(today) + "       ...completed experiment for "
            + sess.sessdata.ParticipantID + ".");
         var fileName = np.dataDirectory + "/incomplete/data-" + sess.sessdata.ExperimentName + "-" + sess.sessdata.ParticipantID
            + "-" + new Date().toISOString().slice(0, 10) + ".csv";
         rm("-Rf", fileName);
         sess.destroy();                                                       // Destroy session data
      }
      res.json({ "Data": "Experiment session terminated", "Experiment": np.experimentName, "Time": today.toISOString() });
   });

   return np;
}

module.exports = setupNodusPonens;