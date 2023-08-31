# nelson-short-links-service
Service to generate short links for Nelson. Ref: https://projectnelson.atlassian.net/wiki/spaces/NELS/pages/2293202949/MS7+-+Short+Links+Service

## Local environment installation instructions
If you plan to deploy this service to a VM or fixed instance, use the commands below. If you want to deploy this to a serverless archirecture, build a deployment script and use the functions in the lambda_src folder.

### Dev dependencies:
These are dependencies that are expected to be pre-installed on the system before running scripts.
<ul>
<li>nodejs - developed using node lts/hydrogen (v18.17.1). Not tested for lower versions</li>
<li>nodemon - For hot reloads</li>
</ul>

### Install instructions:
<code>npm install</code>

### Run commands
#### Link manager
The scripts run on an express server for testing or standalone machine deployment<br>
Update the environment variables in package.json file before running the below command
<code>npm run manager</code>

#### Link redirection
<ul>
<li>Make sure that the TenantLinks table is updated with all the required alias for the tenant</li>
<li>Update the hosts file to point all the test domans to 0.0.0.0 or 127.0.0.1 (localhost)</li>
<li>Start the redirect service using 
<code>npm run startredirectsvc --host=XXXXX [--port=80]</code>
<br>Replace host and port with the test domain and ports. The optional port is 80 by default to support http requests. The service doesn't support HTTPS requests for local testing yet.
<br>To test multiple hosts, start multiple instances of the service with different host values
</li>
</li>Open the test link using a browser. The service should redirect you the expected destination or respond with error 404 
</ul>
Start service by running command
<code>npm run redirectsvc<br></code>
Remember that this does't include the manager debug.

Update the environment variables in package.json for the local script if any changes are required

Alternately, to debug the code on vscode, a vs launch.json has been included. Update the AWS credentials and any other environment variables as required to use this.

## Lambda deployment instructions
redirectsvc can directly be deployed to lambda since it doesn't have any non-aws library dependency. This instruction is for link manager which has external dependency
- Create a new folder called link manager
- Copy the linkmanager.js file to the new folder
- Run command ```npm install short-unique-id```
- Remove the package.json and package-lock.json files (this is not required in lambda)
- Create a deployment zip by running command ```zip -r linkmanagerdeploy.zip .```
- Upload to lambda by running command ```aws lambda update-function-code --function-name {{Function Name}} --zip-file fileb://./linkmanager.zip```
- Replace the function name and add an aws profile if required

## Project file descriptions
There are 3 key files in the project
<ul>
    <li>linkmanager.js - This script manages CRUD operations on the short links. </li>
    <li>redirectsvc.js - This script manages the URL redirection </li>
    <li>error404.html - This page is the default 404 page that is designed to be hosted in the cloud service provider</li>
    <li>index.js - Used to test the redirectsvc. Hosts a simple server for the test domains </li>
</ul>