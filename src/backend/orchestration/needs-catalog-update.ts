// ~~ Generated by projen. To modify, edit .projenrc.js and run "npx projen".
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';
import { Construct } from '@aws-cdk/core';

export interface NeedsCatalogUpdateProps extends lambda.FunctionOptions {
}

export class NeedsCatalogUpdate extends lambda.Function {
  constructor(scope: Construct, id: string, props?: NeedsCatalogUpdateProps) {
    super(scope, id, {
      description: 'backend/orchestration/needs-catalog-update.lambda.ts',
      ...props,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '/needs-catalog-update.lambda.bundle')),
    });
  }
}