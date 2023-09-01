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
    Using PUT so we can have a dynamic payload
*/
app.put('/shortlink', function (req, res) {
    console.log(`Requesting new short link for`);
    console.log(req.body);
    linkmanager.handler(req.body).then((ret) => {
        res.send(ret);
    }).catch(function (err) {
        console.log(err);
    });
});

/*
    API to test shortlink update.
    Pass data for the short links service into the request body in the same format expected by linkmanager
    Using POST so we can have a dynamic payload
*/
app.post('/shortlink', function (req, res) {
    console.log(`Updating new short link for`);
    console.log(req.body);
    linkmanager.handler(req.body).then((ret) => {
        res.send(ret);
    }).catch(function (err) {
        console.log(err);
    });
});

/*
    API to test shortlink deletion.
    Pass data for the short links service into the request body in the same format expected by linkmanager
    Using DELETE so we can have a dynamic payload
*/
app.delete('/shortlink', function (req, res) {
    console.log(`Deleting short link for`);
    console.log(req.body);
    linkmanager.handler(req.body).then((ret) => {
        res.send(ret);
    }).catch(function (err) {
        console.log(err);
    });
});

/*
    API to read shortlink data.
*/
app.get('/shortlink/:id', function (req, res) {
    console.log(`Getting short link for id ${req.params.id}`);
    linkmanager.handler({
        "id": req.params.id,
        "action": "get"
    }).then((ret) => {
        res.send(ret);
    }).catch(function (err) {
        console.log(err);
    });
});

app.listen(port, function () {
    console.log(`Link manager server started on port ${port}`);
});