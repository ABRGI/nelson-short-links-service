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
<code>
npm install
</code>

### Run commands
#### To generate a new short link, run command 
<code>
npm run generatelink
</code>

#### To delete an existing link, run command
<code>
npm run deletelink
</code>

#### To update an existing link, run command
<code>
npm run updatelink
</code>

#### To get an existing link info, run command
<code>
npm run getlink
</code>

#### To test link redirection, run command
<ul>
<li>Make sure that the TenantLinks table is updated with all the required alias for the tenant</li>
<li>Update the hosts file to point all the test domans to 0.0.0.0 or 127.0.0.1 (localhost)</li>
<li>Start the redirect service using 
<code>
npm run startredirectsvc --host=XXXXX [--port=80]
</code>
<br>Replace host and port with the test domain. The optional port is 80 by default to support http requests. The service doesn't support HTTPS requests for local testing yet.
</li>
</li>Open the test link using a browser. The service should redirect you the expected destination or respond with error 404 
</ul>

<b>Note:</b> The index.js script contains endpoints to test or debug the link manager as well instead of calling the service through commandline. Start this by running command
<code>
npm run local<br>
</code>
Remember that this does't include the redirect service.

Update the environment variables in package.json for the local script if any changes are required

Alternately, to debug the code on vscode, a vs launch.json has been included. Update the AWS credentials and any other environment variables as required to use this.

## Project file descriptions
There are 3 key files in the project
<ul>
    <li>linkmanager.js - This script manages CRUD operations on the short links. </li>
    <li>redirectsvc.js - This script manages the URL redirection </li>
    <li>error404.html - This page is the default 404 page that is designed to be hosted in the cloud service provider</li>
    <li>index.js - Used to test the redirectsvc. Hosts a simple server for the test domains </li>
</ul>