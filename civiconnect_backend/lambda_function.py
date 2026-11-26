import json
import os
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key

table = boto3.resource('dynamodb').Table(os.environ['TABLE'])
s3 = boto3.client('s3')
sns = boto3.client('sns')


def res(code, body):
    return {"statusCode": code, "body": json.dumps(body, default=str)}


def lambda_handler(event, context):
    route = event['routeKey']

    if route == 'GET /track/{id}':
        cid = event['pathParameters']['id'].strip().upper()
        r = table.query(IndexName='complaintId-index',
                        KeyConditionExpression=Key('complaintId').eq(cid))
        if not r['Items']:
            return res(404, {"message": "Complaint not found"})
        c = r['Items'][0]
        return res(200, {"complaintId": cid, "title": c['title'],
                         "category": c['category'], "status": c['status'],
                         "createdAt": c['createdAt']})

    claims = event['requestContext']['authorizer']['jwt']['claims']
    uid = claims['sub']
    body = json.loads(event.get('body') or '{}')

    if route == 'POST /upload-url':
        ctype = body.get('contentType', 'image/jpeg')
        key = f"{uid}/{uuid.uuid4()}.{ctype.split('/')[-1]}"
        url = s3.generate_presigned_url(
            'put_object',
            Params={'Bucket': os.environ['BUCKET'], 'Key': key, 'ContentType': ctype},
            ExpiresIn=300)
        return res(200, {"uploadUrl": url, "key": key})

    if route == 'POST /complaints':
        cid = "CC-" + uuid.uuid4().hex[:8].upper()
        item = {
            "userId": uid, "complaintId": cid, "email": claims.get('email'),
            "title": body['title'], "category": body['category'],
            "location": body['location'], "description": body['description'],
            "images": body.get('images', []), "status": "Pending",
            "createdAt": datetime.now(timezone.utc).isoformat()}
        table.put_item(Item=item)
        sns.publish(
            TopicArn=os.environ['TOPIC_ARN'],
            Subject=f"CiviConnect: Complaint {cid} registered",
            Message=(f"Your complaint '{item['title']}' has been registered successfully.\n"
                     f"Complaint ID: {cid}\nStatus: Pending"),
            MessageAttributes={'userId': {'DataType': 'String', 'StringValue': uid}})
        return res(200, {"complaintId": cid})

    if route == 'GET /complaints':
        r = table.query(KeyConditionExpression=Key('userId').eq(uid))
        return res(200, r['Items'])

    return res(404, {"message": "Not found"})
