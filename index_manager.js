/*
    This script helps to test the short links manager on a local deployment
    It can be used to deploy to a VM for a prod or stage deployment
    However, it is adviced to use the serverless deployment on any stage
    Follow instructions in the README.md file to install and run

    Note: Do not consider the API in this file as the actual format for calling the functions in a serverless deployment
    Follow the instructions in the individual scripts descriptions

    Expected env vars
    - PORT
    - LINKS_TABLE
    - TENANT_LINKS_TABLE
    - ENV_REGION
    - ID_LENGTH
    - INCLUDE_TIME_STAMP    If true, it will apply only if ID_LENGTH >= 10
    - LOCAL     [Set true if local deployment. Ignore if prod]
    - ACCESSKEY [Only for local deployment]
    - SECRETKEY [Only for local deployment]
*/

const express = require('express');
const bodyparser = require('body-parser');
const linkmanager = require('./src/linkmanager');

const port = process.env.PORT;
var app = express();
app.use(bodyparser.json());

/*
    API to test shortlink generation.
    Pass data for the short links service into the request body in the same format expected by linkmanager
*/
app.put('/shortlink', function (req, res) {
    console.log(`Requesting new short link for`);
    console.log(req.params);
    linkmanager.handler(req.params).then((ret) => {
        res.send(ret);
    }).catch(function (err) {
        console.log(err);
    });
});