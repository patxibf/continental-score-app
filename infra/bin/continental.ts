#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { ContinentalStack } from '../lib/continental-stack'

const app = new cdk.App()
new ContinentalStack(app, 'ContinentalStack', {
  env: { region: 'us-east-1' },
})
