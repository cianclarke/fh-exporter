var doLogIn = require('./doLogIn');
var createObjectViaFile = require('./createObjectViaFile');
var fhc = require('fh-fhc');
var async = require('async');
var _ = require('underscore');

var createThemeViaFile = function(themeDefinition, asyncMapCb){
  return createObjectViaFile('theme', themeDefinition, asyncMapCb);
};

var importNewThemes = function(config, oldThemes, cb){
  doLogIn(config.to, function(loginErr){
    if (loginErr){
      return cb(loginErr);
    }
    return async.map(oldThemes, createThemeViaFile, function(err, createResults){
      if (!err){
        console.log('Imported ' + createResults.length + ' themes');
      }
      return cb(err, createResults);
    });
  });
};

var getFullThemeDefinition = function(themeId, cb){
  return fhc.appforms.themes.read({ id : themeId }, function(err, themeResult){
    if (err){
      return cb(err);
    }
    return cb(null, themeResult);
  });
};

var getOldThemes = function(config, cb){  
  doLogIn(config.from, function(loginErr){
    if (loginErr){
      return cb(loginErr);
    }
    fhc.appforms.themes.list({_ : []}, function(err, themes){
      if (err){
        return cb(err);
      }
      // remove the base template - this will conflict on create
      themes = _.filter(themes, function(theme){
        return theme.name !== 'Base Template';
      });
      var themeIds = _.pluck(themes, '_id');
      
      
      async.map(themeIds, getFullThemeDefinition, function gotThemes(err, themes){
        if (err){
          return cb(err);
        }
        console.log('Retrieved ' + themes.length + ' old theme definitions');
        return cb(null, themes);
      });
    });
  })
};

module.exports = function(config, cb){
  console.log('Beginning operation themes');
  return async.waterfall([
    async.apply(getOldThemes, config),
    function(oldThemes, waterfallCb){
      return importNewThemes(config, oldThemes, waterfallCb);
    }
  ], cb);
};
