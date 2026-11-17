#!/usr/bin/env bash
# Deploy dist/ to the REANIMATOR S3 + CloudFront stack. Run `make check` first (builds dist/ and runs the dist guard).
# Usage: infra/deploy.sh [region]   (default us-west-2)
set -euo pipefail
cd "$(dirname "$0")/.."
R="${1:-us-west-2}"; S=reanimator-site
node tools/release/check-dist.ts
aws cloudformation deploy --template-file infra/site.yaml --stack-name "$S" --region "$R" --no-fail-on-empty-changeset --tags Project=REANIMATOR
out() { aws cloudformation describe-stacks --stack-name "$S" --region "$R" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
B=$(out BucketName); D=$(out DistributionId)
cd dist
up() { aws s3 cp . "s3://$B/" --recursive --region "$R" --exclude "*" --include "$1" --content-type "$2" --cache-control "$3" --only-show-errors; }
up "assets/*.js" text/javascript "public,max-age=31536000,immutable"
up "assets/*.css" text/css "public,max-age=31536000,immutable"
up "*.glb" model/gltf-binary "public,max-age=86400"
up "*.webp" image/webp "public,max-age=86400"
up "*.png" image/png "public,max-age=86400"
aws s3 cp index.html "s3://$B/index.html" --region "$R" --content-type "text/html; charset=utf-8" --cache-control no-cache --only-show-errors
aws s3 cp manifest.webmanifest "s3://$B/manifest.webmanifest" --region "$R" --content-type "application/manifest+json" --cache-control no-cache --only-show-errors
aws cloudfront create-invalidation --distribution-id "$D" --paths "/*" --query Invalidation.Id --output text
echo "Live: $(out SiteUrl)"
