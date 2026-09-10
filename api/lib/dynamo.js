/* Share link store, ported from utils/dynamo.js. Same table, same region, same
   item shape. Optional: with no AWS credentials in the environment nothing is
   stored and the caller is told so, rather than the request failing. */

"use strict";

const TABLE_NAME = "gryd_site_tool_assessments";
const REGION = process.env.AWS_REGION || "eu-north-1";

function configured() {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
}

function client() {
  // Required lazily so the function loads on a deploy that has no AWS SDK.
  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
}

async function storePayload(uuid, payload) {
  if (!configured()) { return { stored: false }; }
  const { PutCommand } = require("@aws-sdk/lib-dynamodb");
  await client().send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      uuid: uuid,
      timestamp: new Date().toISOString(),
      email: payload.email,
      payload: JSON.stringify(payload)
    }
  }));
  return { stored: true, uuid: uuid };
}

async function getPayload(uuid) {
  if (!configured()) { return null; }
  const { GetCommand } = require("@aws-sdk/lib-dynamodb");
  const out = await client().send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { uuid: uuid }
  }));
  return out.Item ? JSON.parse(out.Item.payload) : null;
}

module.exports = { storePayload, getPayload, configured, TABLE_NAME, REGION };
