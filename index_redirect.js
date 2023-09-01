/*
    Test instructions
    - Update your host to include all domains you want to test
    - Point all the test domains to the local server. Example below 
            127.0.0.1       ts.ly
            127.0.0.1       om.co
            127.0.0.1       bt.io
    - Deploy this service with port 80 if using http or port 443 if using https (with SSL)
    - Generate a link using the link manager service. Add the configured domains as aliases with some test data
    - Call the link with throgh domain to see if redirection works as expected
*/

const express = require('express');
const bodyparser = require('body-parser');
const linkredirect = require('./src/redirectsvc');

const port = process.env.PORT;
var app = express();
app.use(bodyparser.json());

app.get('/*', function (req, res) {
    console.log(`Redirecting`);
    console.log(req);
    linkredirect.handler({
        rawPath: req.url,
        headers: {
            "nelson-host": req.hostname
        }
    }).then((ret) => {
        res.statusCode = ret.statusCode;
        if (res.statusCode == 302) {
            res.setHeader('Location', ret.headers['Location']);
        }
        res.send(ret.body);
    })
        .catch(function (err) {
            console.log(err);
            res.send();
        });
});

app.listen(port, function () {
    console.log(`Link redirect service started on port ${port}`);
});