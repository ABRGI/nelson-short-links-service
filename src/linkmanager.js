/* 
    Script manages CRUD on the short link
    The script is not hosted as an API but is expected to be hosted directly as a lambda function
    Function params are accessed directly from the event argument

    Script uses shortuniqueid (https://shortunique.id/) to generate the UUID which is short enough to be used for a short URL.
    The max length of the id is configured from the env variables

    Expected env vars
    - LINKS_TABLE
    - TENANT_LINKS_TABLE
    - ENV_REGION
    - ID_LENGTH
    - INCLUDE_TIME_STAMP    If true, it will apply only if ID_LENGTH >= 10
    - LOCAL     [Set true if local deployment. Ignore if prod]
    - ACCESSKEY [Only for local deployment]
    - SECRETKEY [Only for local deployment]

    Expected function argument schema:
    {
        "environmentid": "UUID",
        "tenantid": "UUID",
        "action": "create",
        "descripion": "string",
        "id": "id string",
        "destination": "url string",
        "startdate": "date string",
        "enddate": "date string",
        "domains": {
            "[domainname]": {
                "startdate": "date string",
                "enddate": "date string"
            }
        }
    }
    The environmentid and tenantid params are required for all actions
    If the action is create, then only the destination is required. The start and end dates are optional
    If the action is update, then the id is required. The rest of the fields are optional.
        To remove a field, pass false to the attribute
        To add a field, pass the data for that field
        This includes domains or the start and end dates within the domains
    If the action is delete, then only the id is required.
    The description parameter is optional and will be used for analytics and reporting

    The domains object is optional. If present, it should be a JSON object with the following format:
    {
        "[domainname]": {
            "startdate": "date string",
            "enddate": "date string"
        }
    }
    Where any number of domains can be added to the object. Each of them contain their own rule
    The redirect function will look for the rule if it exists and apply.
    Note that If no rule exists for the domain, the default rule is not taken. The URL will be indefinitely available when accessed through that domain

    The function will add an entry to the tenant list table to get a quick summary of all links owned by a client/environment
    The function will add change logs to the links table entry under the logs object

    Function returns a JSON object with the following format:
    {
        id: "id string"
    }
    Function returns a JSON object with the following format:
    {
        error: "error string"
    }

    Exception handling:
    If any unhandled exception occurs, the exception is logged along with the response object in the current state
    If any partial changes were made to an table, the dev needs to look for the data using the short link id in the response object (if present) and take appropriate action if required
*/
const { DynamoDB } = require("@aws-sdk/client-dynamodb");
const { unmarshall, marshall } = require("@aws-sdk/util-dynamodb");
const ShortUniqueId = require('short-unique-id');

const dynamoprops = { region: process.env.ENV_REGION }
if (process.env.LOCAL) {
    dynamoprops.credentials = {
        accessKeyId: process.env.ACCESSKEY,
        secretAccessKey: process.env.SECRETKEY
    };
}
const dynamoclient = new DynamoDB(dynamoprops);

var uid = new ShortUniqueId({ length: process.env.ID_LENGTH });

exports.handler = async (event) => {
    var response = {
        consumedcapacityUnits: 0
    };
    try {
        if (event.environmentid == undefined || typeof (event.environmentid) != "string") {
            response.error = "Invalid environmentid";
        }
        else if (event.tenantid == undefined || typeof (event.tenantid) != "string") {
            response.error = "Invalid tenantid";
        }
        else if (event.action == undefined || typeof (event.action) != "string") {
            response.error = "Invalid action";
        }
        else if (event.action == "create") {
            if (event.destination == undefined) {
                response.error = "Missing destination";
            }
            else if(event.description != undefined && typeof(event.description) != "string") {
                response.error = "Invalid description";
            }
            else {
                var data = {
                    destination: event.destination,
                    createddate: Date.now(),
                    domains: {},
                    logs: {}
                };
                var validation = validate(event);
                if (!validation.valid) {
                    response.error = `Invalid field(s): ${validation.errorfield.join(',')}`;
                }
                else {
                    data.startdate = event.startdate;
                    data.enddate = event.enddate;
                    var isvalid = true;
                    if (event.domains) {
                        for (var domain in event.domains) {
                            validation = validate(event.domains[domain]);
                            if (!validation.valid) {
                                response.error = `Invalid field(s) for domain "${domain}": ${validation.errorfield.join(',')}`;
                                isvalid = false;
                                break;
                            }
                            else {
                                data.domains[domain] = {
                                    startdate: event.domains[domain].startdate,
                                    enddate: event.domains[domain].enddate
                                }
                            }
                        }
                    }
                    if (isvalid) {
                        // Check if id already exists in the DB
                        var duplicateid = false;
                        do {
                            // Generate new id
                            data.id = process.env.ID_LENGTH >= 10 && process.env.INCLUDE_TIME_STAMP ? uid.stamp(process.env.ID_LENGTH) : uid();
                            const dynamoresponse = getlink(data.id);
                            if (dynamoresponse.Item) {
                                duplicateid = true;
                            }
                            response.consumedcapacityUnits += dynamoresponse.ConsumedCapacity.CapacityUnits;
                        } while (duplicateid);
                        /*
                            Assigning the id to response before we put to the DB
                            This is done because in case of an exception, dev needs to be able to find the partial records created in the DB if any
                            The response in its current state is logged along with the exception message
                        */
                        response.id = data.id;
                        // Build dynamo object
                        var dynamoobj = marshall(data);
                        const dynamonewlinkresponse = await dynamoclient.putItem({
                            TableName: process.env.LINKS_TABLE,
                            ReturnConsumedCapacity: "INDEXES",
                            Item: dynamoobj
                        });
                        if (dynamonewlinkresponse && dynamonewlinkresponse.ConsumedCapacity) {
                            response.consumedcapacityUnits += dynamonewlinkresponse.ConsumedCapacity.CapacityUnits;
                        }
                        const dynamotenantlinkresponse = await dynamoclient.updateItem({
                            TableName: process.env.TENANT_LINKS_TABLE,
                            ReturnConsumedCapacity: "INDEXES",
                            Key: marshall({ environmentid: event.environmentid, tenantid: event.tenantid }),
                            UpdateExpression: "set #linkid = :linkid",
                            ExpressionAttributeNames: {
                                "#linkid": 'linkid',
                            },
                            ExpressionAttributeValues: {
                                ":linkid": marshall(data.id)
                            }
                        });
                        if (dynamotenantlinkresponse && dynamotenantlinkresponse.ConsumedCapacity) {
                            response.consumedcapacityUnits += dynamotenantlinkresponse.ConsumedCapacity.CapacityUnits;
                        }
                    }
                }
            }
        }
        else if (event.action == "update") {
            // TODO: Validate event parameters and update the link along with logs.
        }
        else if (event.action == "delete") {
            if (event.id == undefined) {
                response.error = "Missing id";
            }
            else {
                const dynamoresponse = getlink(event.id);
                if (dynamoresponse && dynamoresponse.ConsumedCapacity.CapacityUnits) {
                    response.consumedcapacityUnits += dynamoresponse.ConsumedCapacity.CapacityUnits;
                }
                if (!dynamoresponse.Item) {
                    response.error = "Link not found";
                }
                else if (unmarshall(dynamoresponse.Item).deleteddate) {
                    response.error = "Link already deleted";
                }
                else {
                    const deleteresponse = await dynamoclient.updateItem({
                        TableName: process.env.LINKS_TABLE,
                        ReturnConsumedCapacity: "INDEXES",
                        Key: marshall({ id: event.id }),
                        UpdateExpression: "set #deleteddate = :deleteddate",
                        ExpressionAttributeNames: {
                            "#deleteddate": 'deleteddate',
                        },
                        ExpressionAttributeValues: {
                            ":deleteddate": marshall(Date.now())
                        }
                    });
                    if (deleteresponse && deleteresponse.ConsumedCapacity) {
                        response.consumedcapacityUnits += deleteresponse.ConsumedCapacity.CapacityUnits;
                    }
                }
            }
        }
        else {
            response.error = "Unrecognized action";
        }
    }
    catch (e) {
        console.log("Error creating short link! Refer below for debug info.");
        console.log(e);
        console.log(event);
        console.log(response);
        response.error = "Internal server error";
    }
    finally {
        if(response.error) {
            console.log(`Error creating short link! ${response.error}. Refer below for event.`);
            console.log(event);
        }
        return response;
    }
};

function validate(data) {
    var ret = {
        valid: true
    }
    if (data.startdate && isNaN(new Date(startdate))) {
        ret.valid = false;
        ret.errorfield = ["start date"];
    }
    if (data.enddate && isNaN(new Date(enddate))) {
        ret.valid = false;
        ret.errorfield = (ret.errorfield || []).concat("end date");
    }
}

async function getlink(id) {
    return await dynamoclient.getItem({
        TableName: process.env.LINKS_TABLE,
        ReturnConsumedCapacity: "INDEXES",
        Key: marshall({ id: id })
    });
}