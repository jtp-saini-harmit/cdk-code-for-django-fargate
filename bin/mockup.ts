#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HSMyArchitectureStack } from '../lib/aws-infra';

const app = new cdk.App();

// Create the main application stack in ap-northeast-1
const mainStack = new HSMyArchitectureStack(app, 'HSMyArchitectureStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  }
});

app.synth();
