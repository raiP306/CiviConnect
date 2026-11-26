import json
import os

import boto3

sns = boto3.client('sns')


def lambda_handler(event, context):
    attrs = event['request']['userAttributes']
    sns.subscribe(
        TopicArn=os.environ['TOPIC_ARN'],
        Protocol='email',
        Endpoint=attrs['email'],
        Attributes={'FilterPolicy': json.dumps({'userId': [attrs['sub']]})})
    return event
