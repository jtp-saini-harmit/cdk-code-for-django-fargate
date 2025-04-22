#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HSMyArchitectureStack } from '../lib/aws-infra';

const app = new cdk.App();

// Deploy network and database infrastructure
const myStack = new HSMyArchitectureStack(app, 'HSMyArchitectureStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});

app.synth();

/*
To deploy separately:

1. Build and push Docker image:
   aws ecr get-login-password | docker login --username AWS --password-stdin 495599737203.dkr.ecr.ap-northeast-1.amazonaws.com
   docker build -t products-django-app ./django-app
   docker tag products-django-app:latest 495599737203.dkr.ecr.ap-northeast-1.amazonaws.com/products-django-app:latest
   docker push 495599737203.dkr.ecr.ap-northeast-1.amazonaws.com/products-django-app:latest

1. Deploy AWS Stack:
   cdk deploy HSMyArchitectureStack
*/
