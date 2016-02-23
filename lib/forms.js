var doLogIn = require('./doLogIn');
var createObjectViaFile = require('./createObjectViaFile');
var fhc = require('fh-fhc');
var async = require('async');
var _ = require('underscore');
var fs = require('fs');

var getFullFormDefinition = function(formId, cb){
  return fhc.appforms.forms.read({ id : formId }, function(err, formResult){
    if (err){
      return cb(err);
    }
    return cb(null, formResult);
  });
};



var getOldForms = function(config, cb){  
  doLogIn(config.from, function(loginErr){
    if (loginErr){
      return cb(loginErr);
    }
    fhc.appforms.forms.list({_ : []}, function(err, forms){
      if (err){
        return cb(err);
      }
      var formIds = _.pluck(forms, '_id');
      async.map(formIds, getFullFormDefinition, function gotForms(err, forms){
        if (err){
          return cb(err);
        }
        console.log('Retrieved ' + forms.length + ' old form definitions');
        return cb(null, forms);
      });
    });
  })
};

var createFormViaFile = function(formDefinition, asyncMapCb){
  return createObjectViaFile('form', formDefinition, asyncMapCb);
};


var importNewForms = function(config, oldForms, cb){
  doLogIn(config.to, function(loginErr){
    if (loginErr){
      return cb(loginErr);
    }
    return async.map(oldForms, createFormViaFile, function(err, createResults){
      if (!err){
        console.log('Imported ' + createResults.length + ' forms');
      }
      return cb(err, createResults);
    });
  });
};

module.exports = function(config, cb){
  console.log('Beginning operation forms');
  return async.waterfall([
    async.apply(getOldForms, config),
    function(oldForms, waterfallCb){
      return importNewForms(config, oldForms, waterfallCb);
    }
  ], cb);
};
