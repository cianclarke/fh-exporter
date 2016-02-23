var fhc = require('fh-fhc');
module.exports = function doLogIn(loginConfig, cb){
  fhc.target({_ : [loginConfig.url]}, function(err){
    if (err){
      return cb(err);
    }
    console.log('Successfully targeted from url: ' + loginConfig.url);
    fhc.login({ _ : [loginConfig.username, loginConfig.password] }, function(err){
      if (!err){
        console.log("Logged in as " + loginConfig.username);
      }
      return cb(err);
    });
  });
};
