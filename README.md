# CiviConnect

A serverless web application where citizens can report civic problems such as potholes, garbage, water leakage and street light issues, and track the status of their complaints.

**Live demo:** http://civiconnect-project-deployment.s3-website.ap-south-1.amazonaws.com

## Features

- Sign up, email verification and login using Amazon Cognito
- Register a complaint with title, category, location, description and up to 3 photos
- Photos are uploaded directly to Amazon S3 using presigned URLs
- Complaint details are stored in Amazon DynamoDB
- A confirmation email with the complaint ID is sent using Amazon SNS
- "My Complaints" page to see the status of your own complaints
- Public "Track Your Complaint" search by complaint ID (no login required)

## Architecture

```
Browser (HTML, CSS, JavaScript)
   |
   |-- Amazon Cognito -------------> signup, email verification, login
   |        |
   |        '-- Post-confirmation Lambda --> subscribes user email to SNS
   |
   '-- API Gateway (JWT authorizer)
            |
            '-- Lambda (Python)
                   |-- DynamoDB ----> complaint data
                   |-- S3 ----------> complaint photos
                   '-- SNS ---------> confirmation email
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Authentication | Amazon Cognito |
| API | Amazon API Gateway (HTTP API, JWT authorizer) |
| Compute | AWS Lambda (Python 3.12) |
| Database | Amazon DynamoDB |
| File storage | Amazon S3 |
| Notifications | Amazon SNS |
| Hosting | Amazon S3 static website hosting |
| Monitoring | Amazon CloudWatch |

## How it works

1. The user signs up and verifies their email with a code sent by Cognito.
2. A post-confirmation Lambda subscribes the user's email to an SNS topic with a filter on their user ID.
3. After login, the browser receives an ID token that is sent with every API request.
4. For each photo, the API returns a presigned S3 URL and the browser uploads the file directly to S3.
5. The complaint is saved in DynamoDB and SNS sends a confirmation email.
6. The user can view their complaints, or anyone can look up a complaint status by ID.

## API routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /upload-url | Yes | Get a presigned URL for image upload |
| POST | /complaints | Yes | Register a new complaint |
| GET | /complaints | Yes | List the logged-in user's complaints |
| GET | /track/{id} | No | Get the status of a complaint by ID |

## Database design

DynamoDB table `Complaints`

- Partition key: `userId` (String)
- Sort key: `complaintId` (String)
- Global secondary index `complaintId-index` (partition key `complaintId`) for public lookup by ID

## Project structure

```
frontend/
  index.html
  style.css
  app.js
  hero.png
backend/
  lambda_function.py                  main API Lambda
  lambda_function_post_confirm.py     Cognito post-confirmation Lambda
```

## Setup

1. Create a Cognito user pool and an app client without a secret. Enable `ALLOW_USER_PASSWORD_AUTH`.
2. Create the DynamoDB table and the `complaintId-index` index.
3. Create a private S3 bucket for photos and add a CORS rule for your website origin.
4. Create an SNS topic.
5. Create the two Lambda functions and add the environment variables below, with IAM permissions for DynamoDB, S3 and SNS.
6. Attach the post-confirmation Lambda to the Cognito user pool.
7. Create an HTTP API with the four routes above and a JWT authorizer using your user pool as the issuer and the app client ID as the audience. The `/track/{id}` route must stay public.
8. Enable CORS on the API for your website origin.
9. Set `clientId` and `apiUrl` in `frontend/app.js` and host the frontend on S3.

### Environment variables

| Lambda | Variable | Value |
|---|---|---|
| Main API | `TABLE` | DynamoDB table name |
| Main API | `BUCKET` | S3 bucket name for photos |
| Main API | `TOPIC_ARN` | SNS topic ARN |
| Post-confirm | `TOPIC_ARN` | SNS topic ARN |

## Security notes

- The photos bucket is private. Uploads use short-lived presigned URLs (5 minutes).
- Protected routes are verified by the API Gateway JWT authorizer.
- Users can only read their own complaints.
- The public tracking route returns only the title, category, status and date.
- No secrets are stored in this repository. The values in `app.js` (`clientId`, `apiUrl`) are public identifiers, not credentials.

## Future improvements

- Admin panel to update complaint status and notify users
- Show uploaded photos inside complaints
- HTTPS with CloudFront and a custom domain
- Amazon SES for emails, so users do not need to confirm an SNS subscription

## Author

Priyam Rai - https://www.linkedin.com/in/raipriyam/
