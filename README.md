#fh-exporter  
Exports object definitions via FHC from an old domain, and imports them to a new one.  
Currently this just supports form and theme definitions.  
It is recommended the destination domain has no forms or themes. 

##Usage
    
    # edit config.json, filling out from and to destinations, and the objects you want to operate on. Valid values include "forms", "themes", "projects". 
    npm start
    # you should see a result which reads 'All done'. 
    
##Migrating forms & themes
Simply set the objects in config.json, and run exporter - no pre-requirements here. Note submissions are not currently migrated. 

##Migrating projects
To migrate projects, a number of pre-requisite steps must be completed. 

1. SSH keypairs must be configured locally for both the source and target domain. This means you need to be able to `git clone` from both the source and destination domain for this migration to work. 
2. An `environments` section must be added to `config.json`, specifying the map of source environment IDs to destination environment IDs. See the example in `config.json`. This is due to the disparity in environment naming which can exist - for example, "qa" versus "test"..

###What is migrated:

* Client & Cloud Apps
* Their source code - limited to the "master" branch
* Environment variables across multiple environments
* Database contents across multiple environments

###What is not migrated:

* Historic build artifacts of client apps
* Deploy histories of cloud apps
* Project form associations
* Service associations, or indeed the services associated with these projects
* Connections, connection tags
* Cloud apps with "dedicated", or "upgraded" database.
