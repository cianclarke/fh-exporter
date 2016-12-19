var doLogIn = require('./doLogIn');
var fhc = require('fh-fhc');
var async = require('async');
var _ = require('underscore');
var exec = require('child_process').exec;

var getOldProjects = function(config, cb){
    doLogIn(config.from, function(loginErr){
      if (loginErr){
        return cb(loginErr);
      }
      fhc.services({_ : ['list']}, function(err, projects){
        if (err){
          return cb(err);
        }
        return cb(null, projects);
      });
    });
};

var createNewProjects = function(config, oldProjects, cb){
  return doLogIn(config.to, function(loginErr){
    if (loginErr){
      return cb(loginErr);
    }
    async.map(oldProjects, function createAProject(oldProject, asyncMapCb){
      var oldProjectName = oldProject.title;
      fhc.services({ _ : ['create', oldProjectName] }, function(err, newProject){
        if (err){
          return asyncMapCb(err);
        }
        console.log('Created new project from ' + oldProject.guid + ' with title ' + newProject.title + ' and new guid ' + newProject.guid);
        oldProject.newGuid = newProject.guid;
        return asyncMapCb(null, oldProject);
      });
    }, cb);
  });
};

var deleteOldProjects = function(config, oldProjects, cb){
  return doLogIn(config.from, function(loginErr){
    if (loginErr){
      return cb(loginErr);
    }
    console.log("Doing delete on ");
    async.mapLimit(oldProjects, 20, function deleteAProject(oldProject, asyncMapCb){
      var oldProjectId = oldProject.guid;
      if (oldProject.title.toLowerCase().indexOf('india')>-1 || 
      oldProject.title.toLowerCase().indexOf('barcode')>-1){
        //console.log('skipping ' + oldProject.title);
        return asyncMapCb(null, 'Skipped ' + oldProject.title);
      }else{
        console.log('deleting ' + oldProject.title);
      }
      fhc.services({ _ : ['delete', oldProjectId] }, function(err, deletedProject){
        if (err){
          return asyncMapCb(err);
        }
        console.log('Deleted project from ' + oldProject.guid);
        //oldProject.newGuid = newProject.guid;
        return asyncMapCb(null, deletedProject);
      });
    }, cb);
  });
};

var createApps = function(config, projects, cb){  
  async.map(projects, function(project, asyncMapCb){
    var projectApps = project.apps;
    async.mapSeries(projectApps, function(oldApp, asyncAppCreateCb){
      var oldAppTitle = oldApp.title,
      oldAppType = oldApp.type;
      fhc.app.create({
        project : project.newGuid,
        title : oldAppTitle,
        type : oldAppType,
        empty : true
      }, function(err, newlyCreatedApp){
        if (err){
          return asyncAppCreateCb(err);
        }
        console.log('Created new app from ' + oldApp.guid + ' with title ' + newlyCreatedApp.title + 'and new guid ' + newlyCreatedApp.guid);
        oldApp.newRepo = newlyCreatedApp.internallyHostedRepoUrl;
        oldApp.newGuid = newlyCreatedApp.guid;
        oldApp.newApiKey = newlyCreatedApp.apiKey;
        return asyncAppCreateCb(null, oldApp);
      });
    }, function(err, processedProjectApps){
      if (err){
        return asyncMapCb(err);
      }
      console.log("Assinging project apps as");
      console.log(processedProjectApps);
      project.apps = processedProjectApps;
      return asyncMapCb(null, project);
    });
  }, cb);
};

var cloneOldRepositoriesAndPushToNewRemote = function(config, projects, cb){
  return async.mapSeries(projects, function(project, asyncMapProjectCb){
    
    return async.mapSeries(project.apps, function(app, asyncMapAppCb){
      console.log('Cloning old repo ' + app.internallyHostedRepoUrl + '...');
      var dirName = app.guid;
      dirName = './clones/' + dirName;
      // ideally this would be accomplished via nodegit, and not process.exec, but ssh agent keypair setup was proving too difficult
      var cmd = 'git clone ' + app.internallyHostedRepoUrl + ' ' + dirName + ' ; cd ' + dirName;
      cmd += ' ; git remote add newRemote ' + app.newRepo + ' ; git push newRemote master'

      exec(cmd, function(error, stdout, stderr) {
        if (error){
          return asyncMapAppCb(error);
        }
        return asyncMapAppCb(null, app);
      });
    }, function finishedWithProjectApps(err, appsAfterGitPush){
      if (err){
        console.log('Error cloning old repos');
        console.log(err);
        return asyncMapProjectCb(err);
      }
      project.apps = appsAfterGitPush;
      return asyncMapProjectCb(null, project);
    });
  }, cb);
};

var getOldEnvironmentVariablesToMigrate = function(config, projects, cb){
  doLogIn(config.from, function(loginErr){
    if (loginErr){
      return cb(loginErr);
    }
    var cloudApps = _.map(projects, function(project){
      return _.where(project.apps, {type : "cloud_nodejs"});
    });
    cloudApps = _.flatten(cloudApps),
    envsToCreate = {};
    async.eachSeries(cloudApps, function(cloudApp, asyncCloudAppsMapCb){
      var environmentsFromConfig = _.keys(config.environments);
      async.eachSeries(environmentsFromConfig, function(environmentToCheck, environmentCheckCb){
        fhc.ping({ _ : [cloudApp.guid], env : environmentToCheck }, function(err, envCheckResult){
          if (err || !envCheckResult){
            return environmentCheckCb(null, null);
          }
          fhc.app.envvars.list({ 
            app : cloudApp.guid,
            env : environmentToCheck,
            deployed : true
          }, function(err, envVarListResult){
            if (err || !envVarListResult || !envVarListResult.length || envVarListResult.length === 0){
              return environmentCheckCb();
            }
            // list the env var to create
            var envVarsToCreate = _.each(envVarListResult, function(envVar){
              var newAppGuid = cloudApp.newGuid,
              keyName = envVar.varName;
              envsToCreate[newAppGuid] = envsToCreate[newAppGuid] || {};
              envsToCreate[newAppGuid][keyName] = envsToCreate[newAppGuid][keyName] || {};
              _.each(envVar.varValues, function(environmentValue, environmentName){
                var newEnvironmentName = config.environments[environmentName];
                if (!newEnvironmentName){
                  return;
                }
                envsToCreate[newAppGuid][keyName][newEnvironmentName] = environmentValue;
              });
            });
            return environmentCheckCb();
          });
          
        });
      }, asyncCloudAppsMapCb);
    }, function(err, envVarsToCreate){
      if (err){
        return cb(err);
      }
      return cb(null, envsToCreate);
    });
  });
};

var createEnvironmentVariablesToBeMigrated = function(config, envVarsToBeMigrated, cb){
  doLogIn(config.to, function(loginErr){
    if (loginErr){
      return cb(loginErr);
    }
    var appsNeedingEnvVars = _.keys(envVarsToBeMigrated);
    async.eachSeries(appsNeedingEnvVars, function(appId, everyAppCb){
      console.log('creating env vars for app ' + appId);
      var varsToCreate = envVarsToBeMigrated[appId];
      varsToCreateArray = _.keys(varsToCreate);
      async.eachSeries(varsToCreateArray, function(varToCreate, varCreateCb){
        // A create operation needs to specify an environment - for no good reason. it just does. great.
        var anEnvironmentName = _.first(_.values(config.environments));
        console.log("Creating env var in app " + appId + " named " + varToCreate);
        fhc.app.envvars.create({
          app : appId, 
          env : anEnvironmentName,
          name : varToCreate
        }, function(err, createdEnvVar){
          if (err){
            return varCreateCb(err);
          }
          var envVarId = createdEnvVar.guid;
          var valuesToCreate = varsToCreate[varToCreate];
          valuesToCreate = _.pairs(valuesToCreate);
          async.eachSeries(valuesToCreate, function(valuePair, eachEnvVarCb){
            var name = varToCreate,
            env = valuePair[0],
            value = valuePair[1];
            console.log("Updating env var in app " + appId + " with name " + name + "in env " + env + " with value" + value);
            fhc.app.envvars.update({
              app : appId,
              env : env,
              name : name,
              value : value,
              id : envVarId
            }, eachEnvVarCb);
          }, varCreateCb);
        });
      }, everyAppCb);
    }, cb);
  });
};

var getOldDatabasesToMigrate = function(config, projects, cb){
  doLogIn(config.from, function(loginErr){
    if (loginErr){
      return cb(loginErr);
    }
    console.log('retrieving user API keys for ' + config.from.url);
    fhc.keys.user({_ : []}, function(err, keys){
      if (err){
        return cb(err);
      }
      if (!keys || !keys.list || keys.list.length === 0){
        return cb('No user API key found - you will need to create one manually');
      }
      var userKey = _.first(keys.list).key;
      var cloudApps = _.map(projects, function(project){
        return _.where(project.apps, {type : "cloud_nodejs"});
      });
      cloudApps = _.flatten(cloudApps);
      async.mapSeries(cloudApps, function(cloudApp, asyncCloudAppsMapCb){
        var environmentsFromConfig = _.keys(config.environments);
        async.mapSeries(environmentsFromConfig, function(environmentToCheck, environmentCheckCb){
          if (cloudApp.hasOwnDb[environmentToCheck]){
            // Apps with their own DB don't export correctly right now.. urg..
            console.error('App with id ' + cloudApp.guid + ' has a dedicated databse - this cannot be migrated');
            return environmentCheckCb(null, {});
          }
          if (!cloudApp.runtime[environmentToCheck]){
            // this app not deployed to that env
            console.log('No deployment to environment  ' + environmentToCheck + ' in app ' + cloudApp.guid);
            // we need to return SOMETHING to the map to continue async loop exection - the isEmpty check will filter out this result before importing.
            return environmentCheckCb(null, {});
          }
            
          return fhc.app.db.export({
            app : cloudApp.guid,
            env : environmentToCheck,
            userKey : userKey,
            appKey : cloudApp.apiKey,
            format : 'json'
          }, function(err, exportResult){
            if (err && err.indexOf("No collections to export")>-1){
              console.log('Database in app ' + cloudApp.guid + ' and env ' + environmentToCheck + ' is empty - skipping!');
              // we need to return SOMETHING to the map to continue async loop exection - the isEmpty check will filter out this result before importing.
              return environmentCheckCb(null, {});
            }
            if (err){
              console.log('Error exporting database in app ' + cloudApp.guid + ' and env ' + environmentToCheck);
              console.log(err);
              return environmentCheckCb(err);
            }
            console.log('Found collections in app ' + cloudApp.guid + ' to migrate, filename ' + exportResult.fileName)
            return environmentCheckCb(null, {
              app : cloudApp.newGuid,
              env : config.environments[environmentToCheck],
              appKey : cloudApp.newApiKey,
              fileName : './' + exportResult.fileName
            });
          });
        }, asyncCloudAppsMapCb);
      }, cb);
    });
  });
};

var importDatabasesToBeMigrated = function(config, databasesToMigrate, cb){
  console.log('importing');
  console.log(databasesToMigrate);
  doLogIn(config.to, function(loginErr){
    if (loginErr){
      return cb(loginErr);
    }
    databasesToMigrate = _.flatten(databasesToMigrate);
    databasesToMigrate = _.reject(databasesToMigrate, _.isEmpty);
    console.log('retrieving user API keys for ' + config.to.url);
    fhc.keys.user({_:[]}, function(err, keys){
      if (err){
        return cb(err);
      }
      if (!keys || !keys.list || keys.list.length === 0){
        return cb('No user API key found - you will need to create one manually');
      }
      var userKey = _.first(keys.list).key;
      async.eachSeries(databasesToMigrate, function(databaseToMigrate, importCb){
        databaseToMigrate.userKey = userKey;
        console.log('importing db ' + databaseToMigrate.fileName + ' into ' + databaseToMigrate.app);
        console.log(databaseToMigrate);
        return fhc.app.db.import(databaseToMigrate, importCb);
      }, cb);
    });
  });
};

module.exports = function(config, cb){
  console.log('Beginning operation projects');
  var createdProjects;
  return async.waterfall([
    async.apply(getOldProjects, config),
    function(oldProjects, waterfallCb){
      console.log('got old projects');
      oldProjectsLocal = oldProjects;
      return deleteOldProjects(config, oldProjects, function(){
        return cb('Doneerr!');
      });
    },
    function(projects, waterfallCb){
      return createApps(config, projects, waterfallCb);
    },
    function(createdProjectsWithApps, waterfallCb){
      createdProjects = createdProjectsWithApps;
      return cloneOldRepositoriesAndPushToNewRemote(config, createdProjectsWithApps, waterfallCb);
    },
    // TODO: Deploy all cloud apps? Deploy already deployed cloud apps?
    function(projects, waterfallCb){
      return getOldEnvironmentVariablesToMigrate(config, createdProjects, waterfallCb);
    },
    function(envVarsToMigrate, waterfallCb){
      return createEnvironmentVariablesToBeMigrated(config, envVarsToMigrate, waterfallCb);
    },
    function(waterfallCb){
      return getOldDatabasesToMigrate(config, createdProjects, waterfallCb);
    },
    function(databasesToMigrate, waterfallCb){
      return importDatabasesToBeMigrated(config, databasesToMigrate, waterfallCb);
    }
  ], cb);
};
