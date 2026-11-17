# AWS hosting

Static site only: private S3 bucket behind CloudFront (OAC, HTTPS redirect, HSTS/nosniff/frame-deny headers). No servers, no user data.

- Live: https://dlr55kf9v2hn7.cloudfront.net (stack `reanimator-site`, `us-west-2`, account 908601828278)
- Deploy: `make check && infra/deploy.sh`
- Remove everything: empty the bucket (`aws s3 rm s3://<BucketName> --recursive`), then `aws cloudformation delete-stack --stack-name reanimator-site --region us-west-2`.
