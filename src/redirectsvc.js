/*
    Function executes the redirect for the Nelson short links
    Expected event schema (expects archicture where this is hosted on lambda and configured directly on cloudfron as an origin)
    {
        rawPath: "link id",
        headers: {
            ["nelson-host": "viewer host"]
        }
    }
    
    Behavior:
        The Function will lookup the link id in the LINKS_TABLE
        - If the link is not found, the function will return a 404
        - If the link is found and the link is active, the function will return a 302 redirect to the destination
        - If the link is found and the link is active, but the link has expired, the function will return a 403

        If the nelson-host header is found, the function will look for the host in the aliases object
        If no matching domain is found, the default configuration is used
        If a matching domain is found, the function will override the default rules with the domain rule and thena process based on the validations above

     Expected env vars
    - PORT
    - LINKS_TABLE
    - ENV_REGION
    - LOCAL     [Set true if local deployment. Ignore if prod]
    - ACCESSKEY [Only for local deployment]
    - SECRETKEY [Only for local deployment]

    TODO: Future - Implement analytics logging. Log viewer device, time of call, number of requests, categorize by domain, etc...
*/

const { DynamoDB } = require("@aws-sdk/client-dynamodb");
const { unmarshall, marshall } = require("@aws-sdk/util-dynamodb");

const dynamoprops = { region: process.env.ENV_REGION };
if (process.env.LOCAL) {
    dynamoprops.credentials = {
        accessKeyId: process.env.ACCESSKEY,
        secretAccessKey: process.env.SECRETKEY
    };
}
const dynamoclient = new DynamoDB(dynamoprops);

exports.handler = async (event) => {
    var response = {
        statusCode: 302
    };
    try {
        if (!event.rawPath) {
            response.statusCode = 400;
            response.body = "Missing link id";
        }
        else {
            var now = Date.now();
            var linkdataresponse = await getlink(event.rawPath.replace(/^\/+/, ''));
            if (linkdataresponse.Item) {
                // Add a log that the link was clicked
                const dynamoupdateresponse = await dynamoclient.updateItem({
                    TableName: process.env.LINKS_TABLE,
                    ReturnConsumedCapacity: "NONE",
                    Key: marshall({ id: event.rawPath.replace(/^\/+/, '') }),
                    UpdateExpression: "SET logs.#logdate=:logdata",
                    ExpressionAttributeNames: {
                        '#logdate': now.toString()
                    },
                    ExpressionAttributeValues: {
                        ':logdata': { L: marshall(['Link accessed', event.headers['user-agent'] || 'undefined-user-agent'], {
                            removeUndefinedValues: true
                        }) }
                    }
                });

                // Continue with link redirect
                var linkdata = unmarshall(linkdataresponse.Item);
                if (linkdata.deleteddate) {
                    response.statusCode = 403;
                    response.body = "Link already deleted";
                }
                else {
                    var domain = event.headers['nelson-host'] || null;
                    var enddate = (((domain != null && linkdata.aliases[domain]) ? linkdata.aliases[domain].enddate : null) || linkdata.enddate) || now;
                    var startdate = ((domain != null && linkdata.aliases[domain]) ? linkdata.aliases[domain].startdate : null) || linkdata.startdate || now;
                    if (now < startdate) {
                        response.statusCode = 404;
                        response.body = "Link not found";
                    }
                    else if (now > enddate) {
                        response.statusCode = 403;
                        response.body = "Link expired";
                    }
                    else {
                        response.statusCode = 302;
                        response.headers = {
                            Location: linkdata.destination
                        };
                    }
                }
            }
            else {
                response.statusCode = 404;
                response.body = "Link not found";
            }
        }
    }
    catch (e) {
        console.log('Unable to redirect or process request');
        console.log(e);
        response.statusCode = 500;
    }
    finally {
        return response;
    }
};

async function getlink(id) {
    return await dynamoclient.getItem({
        TableName: process.env.LINKS_TABLE,
        ReturnConsumedCapacity: "INDEXES",
        Key: marshall({ id: id })
    });
}
