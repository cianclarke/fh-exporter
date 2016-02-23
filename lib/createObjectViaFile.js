var fs = require('fs');
var fhc = require('fh-fhc');
module.exports = function(objectName, objectDefinition, asyncMapCb){
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
