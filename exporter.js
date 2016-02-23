var fhc = require('fh-fhc');
var async = require('async');

var operations = {
  // exports all old forms, imports new ones
  forms : require('./lib/forms'),
  themes : require('./lib/themes'),
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
