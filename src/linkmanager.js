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
        "aliases": {
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
        Note:
            Destination can not be removed. It can only be updated
            Only the root alias object can be updated to a new object or removed. Values within the alias can not be updated
    If the action is delete, then only the id is required.
    The description parameter is optional and will be used for analytics and reporting

    The aliases object is optional. If present, it should be a JSON object with the following format:
    {
        "[domainname]": {
            "startdate": "date string",
            "enddate": "date string"
        }
    }
    Where any number of aliases can be added to the object. Each of them contain their own rule
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

const dynamoprops = { region: process.env.ENV_REGION };
if (process.env.LOCAL) {
    dynamoprops.credentials = {
        accessKeyId: process.env.ACCESSKEY,
        secretAccessKey: process.env.SECRETKEY
    };
}
const dynamoclient = new DynamoDB(dynamoprops);

var uid = new ShortUniqueId({ length: 5 });

exports.handler = async (event) => {
    var response = {
        consumedcapacityUnits: 0
    };
    try {
        var now = Date.now();
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
            else if (event.description != undefined && typeof (event.description) != "string") {
                response.error = "Invalid description";
            }
            else {
                var data = {
                    destination: event.destination,
                    createddate: now,
                    aliases: {},
                    logs: {}
                };
                var validation = validate(event);
                if (!validation.valid) {
                    response.error = `Invalid field(s): ${validation.errorfield.join(',')}`;
                }
                else {
                    data.startdate = event.startdate ? new Date(event.startdate).getTime() : undefined;
                    data.enddate = event.enddate ? new Date(event.enddate).getTime() : undefined;
                    data.description = event.description;
                    var isvalid = true;
                    if (event.aliases) {
                        for (var domain in event.aliases) {
                            validation = validate(event.aliases[domain]);
                            if (!validation.valid) {
                                response.error = `Invalid field(s) for domain "${domain}": ${validation.errorfield.join(',')}`;
                                isvalid = false;
                                break;
                            }
                            else {
                                data.aliases[domain] = {
                                    startdate: event.aliases[domain].startdate ? new Date(event.aliases[domain].startdate).getTime() : undefined,
                                    enddate: event.aliases[domain].enddate ? new Date(event.aliases[domain].enddate).getTime() : undefined
                                };
                            }
                        }
                    }
                    if (isvalid) {
                        // Check if id already exists in the DB
                        var duplicateid = false;
                        do {
                            // Generate new id
                            data.id = process.env.ID_LENGTH >= 10 && process.env.INCLUDE_TIME_STAMP ? uid.stamp(process.env.ID_LENGTH) : uid();
                            const dynamoresponse = await getlink(data.id);
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
                        data.logs[now.toString()] = [
                            `Created short link`,
                            `Destination: ${data.destination}`,
                            `Description: ${data.description}`,
                            `Start date: ${data.startdate ? new Date(data.startdate).toISOString() : "N/A"}`,
                            `End date: ${data.enddate ? new Date(data.enddate).toISOString() : "N/A"}`,
                            `Aliases: ${JSON.stringify(data.aliases)}`,                            
                        ];
                        // Build dynamo object
                        var dynamoobj = marshall(data, {
                            removeUndefinedValues: true
                        });
                        const dynamonewlinkresponse = await dynamoclient.putItem({
                            TableName: process.env.LINKS_TABLE,
                            ReturnConsumedCapacity: "INDEXES",
                            Item: dynamoobj
                        });
                        if (dynamonewlinkresponse && dynamonewlinkresponse.ConsumedCapacity) {
                            response.consumedcapacityUnits += dynamonewlinkresponse.ConsumedCapacity.CapacityUnits;
                        }
                        // An entry to tenant links table is made where tenant and environment are identified as tenant.environment
                        const dynamotenantlinkresponse = await dynamoclient.putItem({
                            TableName: process.env.TENANT_LINKS_TABLE,
                            ReturnConsumedCapacity: "INDEXES",
                            Item: marshall({ id: `${event.environmentid}.${event.tenantid}`, linkid: data.id })
                        });
                        if (dynamotenantlinkresponse && dynamotenantlinkresponse.ConsumedCapacity) {
                            response.consumedcapacityUnits += dynamotenantlinkresponse.ConsumedCapacity.CapacityUnits;
                        }
                    }
                }
            }
        }
        else if (event.action == "update") {
            if (event.id == undefined || event.id.length == 0) {
                response.error = "Missing id";
            }
            else if (event.destination != undefined && typeof (event.destination) != "string") {
                response.error = "Invalid destination";
            }
            else if (event.description != undefined && typeof (event.description) != "string" && event.description !== false) {
                response.error = "Invalid description";
            }
            else {
                var updatevalidation = validate(event);
                if (!updatevalidation.valid) {
                    response.error = `Invalid field(s): ${updatevalidation.errorfield.join(',')}`;
                }
                else {
                    //Check if record exists for the tenant, environment and id
                    const dynamotenantlinksresoponse = await gettenantlink(event.environmentid, event.tenantid, event.id);
                    if (dynamotenantlinksresoponse && dynamotenantlinksresoponse.ConsumedCapacity.CapacityUnits) {
                        response.consumedcapacityUnits += dynamotenantlinksresoponse.ConsumedCapacity.CapacityUnits;
                    }
                    if (!dynamotenantlinksresoponse.Item) {
                        response.error = "Link not found";
                    }
                    else {
                        const dynamoresponse = await getlink(event.id);
                        if (dynamoresponse && dynamoresponse.ConsumedCapacity.CapacityUnits) {
                            response.consumedcapacityUnits += dynamoresponse.ConsumedCapacity.CapacityUnits;
                        }
                        if (!dynamoresponse.Item) {
                            response.error = "Link not found";
                        }
                        else if (unmarshall(dynamoresponse.Item).deleteddate) {
                            response.error = "Deleted link cannot be updated";
                        }
                        else {
                            //Start creating the dynamo update statements
                            //Step 1: Identify values to update
                            var updateexpressionnames = {
                                '#logdate': now.toString()
                            };
                            var updateexpressionvalues = {};
                            var updatevalues = ["logs.#logdate=:logdata"];
                            var deletevalues = [];
                            var logdata = [];
                            if (event.destination != null) {
                                updateexpressionnames['#destination'] = 'destination';
                                if (typeof (event.destination) == "string") {
                                    updateexpressionvalues[':destination'] = marshall(event.destination);
                                    updatevalues.push('#destination=:destination');
                                    logdata.push('Updated destination to ' + event.destination);
                                }
                            }
                            if (event.description != null) {
                                updateexpressionnames['#description'] = 'description';
                                if (typeof (event.description) == "string") {
                                    updateexpressionvalues[':description'] = marshall(event.description);
                                    updatevalues.push('#description=:description');
                                    logdata.push('Updated description to ' + event.description);
                                }
                                else {
                                    deletevalues.push('#description');
                                    logdata.push('Deleted description');
                                }
                            }
                            if (event.startdate != null) {
                                updateexpressionnames['#startdate'] = 'startdate';
                                if (typeof (event.startdate) == "boolean") {
                                    deletevalues.push('#startdate');
                                    logdata.push('Deleted startdate');
                                }
                                else {
                                    updateexpressionvalues[':startdate'] = marshall(event.startdate);
                                    updatevalues.push('#startdate=:startdate');
                                    logdata.push('Updated startdate to ' + event.startdate);
                                }
                            }
                            if (event.enddate != null) {
                                updateexpressionnames['#enddate'] = 'enddate';
                                if (typeof (event.enddate) == "boolean") {
                                    deletevalues.push('#enddate');
                                    logdata.push('Deleted enddate');
                                }
                                else {
                                    updateexpressionvalues[':enddate'] = marshall(event.enddate);
                                    updatevalues.push('#enddate=:enddate');
                                    logdata.push('Updated enddate to ' + event.enddate);
                                }
                            }
                            var aliasupdatevaluesvalid = true;
                            if (event.aliases) {
                                var aliasindex = 0;
                                for (var domain in event.aliases) {
                                    updateexpressionnames[`#alias${++aliasindex}`] = domain;
                                    if (event.aliases[domain] === false) {
                                        deletevalues.push(`aliases.#alias${aliasindex}`);
                                        logdata.push(`Deleted alias for domain ${domain}`);
                                    }
                                    else {
                                        validation = validate(event.aliases[domain]);
                                        if (!validation.valid) {
                                            response.error = `Invalid field(s) for domain "${domain}": ${validation.errorfield.join(',')}`;
                                            aliasupdatevaluesvalid = false;
                                            break;
                                        }
                                        else {
                                            updateexpressionvalues[`:alias${aliasindex}`] = {
                                                M: marshall({
                                                    startdate: event.aliases[domain].startdate ? new Date(event.aliases[domain].startdate).getTime() : undefined,
                                                    enddate: event.aliases[domain].enddate ? new Date(event.aliases[domain].enddate).getTime() : undefined
                                                }, {
                                                    removeUndefinedValues: true
                                                })
                                            };
                                            updatevalues.push(`aliases.#alias${aliasindex}=:alias${aliasindex}`);
                                            logdata.push(`Updated alias for domain ${domain} to startdate: ${event.aliases[domain].startdate}; enddate: ${event.aliases[domain].enddate}`);
                                        }
                                    }
                                }
                            }
                            if (aliasupdatevaluesvalid) {
                                updateexpressionvalues[':logdata'] = { L: marshall(logdata) };
                                var updatestring = `set ${updatevalues.join(',')}`;
                                if (deletevalues.length > 0) {
                                    updatestring += ` remove ${deletevalues.join(',')}`;
                                }
                                // Update dynamo
                                const dynamoupdateresponse = await dynamoclient.updateItem({
                                    TableName: process.env.LINKS_TABLE,
                                    ReturnConsumedCapacity: "INDEXES",
                                    Key: marshall({ id: event.id }),
                                    UpdateExpression: updatestring,
                                    ExpressionAttributeNames: updateexpressionnames,
                                    ExpressionAttributeValues: updateexpressionvalues
                                });
                                if (dynamoupdateresponse && dynamoupdateresponse.ConsumedCapacity) {
                                    response.consumedcapacityUnits += dynamoupdateresponse.ConsumedCapacity.CapacityUnits;
                                }
                            }
                        }
                    }
                }
            }
        }
        else if (event.action == "delete") {
            if (event.id == undefined || event.id.length == 0) {
                response.error = "Missing id";
            }
            else {
                const dynamotenantlinksresoponse = await gettenantlink(event.environmentid, event.tenantid, event.id);
                if (dynamotenantlinksresoponse && dynamotenantlinksresoponse.ConsumedCapacity.CapacityUnits) {
                    response.consumedcapacityUnits += dynamotenantlinksresoponse.ConsumedCapacity.CapacityUnits;
                }
                if (!dynamotenantlinksresoponse.Item) {
                    response.error = "Link not found";
                }
                else {
                    const dynamoresponse = await getlink(event.id);
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
                        const dynamodeleteresponse = await dynamoclient.updateItem({
                            TableName: process.env.LINKS_TABLE,
                            ReturnConsumedCapacity: "INDEXES",
                            Key: marshall({ id: event.id }),
                            UpdateExpression: "set #deleteddate = :deleteddate",
                            ExpressionAttributeNames: {
                                "#deleteddate": 'deleteddate',
                            },
                            ExpressionAttributeValues: {
                                ":deleteddate": marshall(now)
                            }
                        });
                        if (dynamodeleteresponse && dynamodeleteresponse.ConsumedCapacity) {
                            response.consumedcapacityUnits += dynamodeleteresponse.ConsumedCapacity.CapacityUnits;
                        }
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
        if (response.error) {
            console.log(`Error creating short link! ${response.error}. Refer below for event.`);
            console.log(event);
        }
        return response;
    }
};

function validate(data) {
    var ret = {
        valid: true
    };
    if (data.startdate && (data.startdate === true || isNaN(new Date(data.startdate)))) {
        ret.valid = false;
        ret.errorfield = ["start date"];
    }
    if (data.enddate && (data.enddate === true || isNaN(new Date(data.enddate)))) {
        ret.valid = false;
        ret.errorfield = (ret.errorfield || []).concat("end date");
    }
    return ret;
}

async function getlink(id) {
    return await dynamoclient.getItem({
        TableName: process.env.LINKS_TABLE,
        ReturnConsumedCapacity: "INDEXES",
        Key: marshall({ id: id })
    });
}

async function gettenantlink(environmentid, tenantid, id) {
    return await dynamoclient.getItem({
        TableName: process.env.TENANT_LINKS_TABLE,
        ReturnConsumedCapacity: "INDEXES",
        Key: marshall({ id: `${environmentid}.${tenantid}`, linkid: id })
    });
}