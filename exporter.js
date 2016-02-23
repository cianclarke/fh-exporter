var fhc = require('fh-fhc');
var async = require('async');
var _ = require('underscore');
var fs = require('fs');
var doLogIn = require('./lib/doLogIn');
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

var createThemeViaFile = function(themeDefinition, asyncMapCb){
  return createObjectViaFile('theme', themeDefinition, asyncMapCb);
};


var createObjectViaFile = function(objectName, objectDefinition, asyncMapCb){
  var filename = './' + objectDefinition._id;
  if (!objectDefinition._id){
    return asyncMapCb('Object has no id - cannot proceed');
  }
  
  // strip all ID tags to subsequent imports will work
  delete objectDefinition._id;
  if (objectDefinition.fieldRules){
    objectDefinition.fieldRules.forEach(function(r){
      delete r._id;
    });  
  }
  if (objectDefinition.pageRules){
    objectDefinition.pageRules.forEach(function(r){
      delete r._id;
    });
  }
  
  return fs.writeFile(filename, JSON.stringify(objectDefinition), function(err){
    if (err){
      return asyncMapCb(err);
    }
    var createQuery = {};
    createQuery[objectName + 'file'] = filename;
    
    return fhc.appforms[objectName + 's'].create(createQuery, function(err, objectCreateResult){
      try{
        fs.unlinkSync(filename);
      }catch(err){
        console.log('failed to clean up ' + filename);
      }
      if (err){
        console.log('Error creating ' + objectName + ' with old ID ' + filename);
        console.log('New definition:');
        console.log(objectDefinition);
        console.log('error: ');
        console.log(err);
        return asyncMapCb(err);
      }
      return asyncMapCb(null, objectCreateResult);
    });
  });
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

var operations = {
  // exports all old forms, imports new ones
  forms : function(config, cb){
    console.log('Beginning operation forms');
    return async.waterfall([
      async.apply(getOldForms, config),
      function(oldForms, waterfallCb){
        return importNewForms(config, oldForms, waterfallCb);
      }
    ], cb);
  },
  themes : function(config, cb){
    console.log('Beginning operation themes');
    return async.waterfall([
      async.apply(getOldThemes, config),
      function(oldThemes, waterfallCb){
        return importNewThemes(config, oldThemes, waterfallCb);
      }
    ], cb);
  },
  projects : require('./lib/projects')
};


(function(closureCb){
  var config = require('./config.json');
  if (!config.from || !config.to || !config.from.url || !config.from.username || !config.from.password || !config.objects || !config.objects.length){
    return closureCb('A valid from, to, url, username and password along with a list of objects to import are required config props');
  }
  
  return fhc.load(function(err){
    if (err){
      return closureCb(err);
    }
    
    // iterate over the things we need to export and import
    async.eachSeries(config.objects, function(object, eachCb){
      if (!operations.hasOwnProperty(object)){
        return eachCb('No operation found for object ' + object);
      }
      return operations[object](config, eachCb);
    }, closureCb);
  });
})(function closureDoneCallback(err, result){
  if (err){
    console.log('Error performing all operations');
    return console.error(err);
  }
  console.log('All done!');
  
});
