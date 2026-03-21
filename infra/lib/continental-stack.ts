import * as cdk from 'aws-cdk-lib'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'

export class ContinentalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // ------------------------------------------------------------------ VPC
    // Public subnets for EC2. Isolated subnets for RDS (no internet, no NAT cost).
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    })

    // --------------------------------------------------------------- Security groups
    const ec2Sg = new ec2.SecurityGroup(this, 'Ec2Sg', {
      vpc,
      description: 'Continental EC2 - SSH and API',
      allowAllOutbound: true,
    })
    ec2Sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH')
    ec2Sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3001), 'Fastify API')

    const dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc,
      description: 'RDS - EC2 only',
      allowAllOutbound: false,
    })
    dbSg.addIngressRule(ec2Sg, ec2.Port.tcp(5432), 'Postgres from EC2')

    // ------------------------------------------------------------------ RDS
    // db.t3.micro is free-tier eligible (750 hrs/month, 20 GB for 12 months)
    const db = new rds.DatabaseInstance(this, 'Db', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      allocatedStorage: 20,
      storageType: rds.StorageType.GP2,
      databaseName: 'continental',
      credentials: rds.Credentials.fromGeneratedSecret('continental', {
        secretName: 'continental/db-credentials',
      }),
      multiAz: false,
      publiclyAccessible: false,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      backupRetention: cdk.Duration.days(0),
    })

    // ------------------------------------------------------------------ EC2 Key Pair
    const keyPair = new ec2.KeyPair(this, 'KeyPair', {
      keyPairName: 'continental-key',
    })

    // ------------------------------------------------------------------ EC2 IAM Role
    const ec2Role = new iam.Role(this, 'Ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        // Enables SSM Session Manager as an alternative to SSH
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    })
    // Let EC2 read DB credentials from Secrets Manager
    db.secret?.grantRead(ec2Role)

    // ------------------------------------------------------------------ EC2 User Data
    // Runs once on first boot: installs Node 20, PM2, clones repo.
    // The deploy workflow (SSH + git pull + pm2 restart) handles all subsequent deploys.
    const userData = ec2.UserData.forLinux()
    userData.addCommands(
      'set -e',
      '# ── Node.js 20 ──',
      'curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -',
      'dnf install -y nodejs git',
      '# ── PM2 (process manager) ──',
      'npm install -g pm2',
      'pm2 startup systemd -u ec2-user --hp /home/ec2-user | tail -1 | bash',
      '# ── Clone app ──',
      'mkdir -p /app && chown ec2-user:ec2-user /app',
      'sudo -u ec2-user git clone https://github.com/patxibf/continental-score-app.git /app/continental',
      'echo "=== First-boot setup complete ==="',
      'echo "Next: add .env to /app/continental/packages/backend/ then start services with PM2"',
    )

    // ------------------------------------------------------------------ EC2 t2.micro
    // t2.micro = free tier (750 hrs/month for 12 months)
    const instance = new ec2.Instance(this, 'Ec2', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: ec2Sg,
      keyPair,
      role: ec2Role,
      userData,
      associatePublicIpAddress: true,
    })

    // Elastic IP keeps the backend URL stable across reboots
    const eip = new ec2.CfnEIP(this, 'Eip', {
      instanceId: instance.instanceId,
    })

    // ------------------------------------------------------------------ S3 (frontend)
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    // ------------------------------------------------------------------ CloudFront
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      // SPA fallback: 403/404 → serve index.html so React Router works
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    })

    // ------------------------------------------------------------------ GitHub Actions IAM user
    // Least-privilege: can only sync this S3 bucket and invalidate this distribution
    const ciUser = new iam.User(this, 'CiUser', { userName: 'continental-ci' })

    ciUser.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
      resources: [siteBucket.bucketArn, `${siteBucket.bucketArn}/*`],
    }))
    ciUser.addToPolicy(new iam.PolicyStatement({
      actions: ['cloudfront:CreateInvalidation'],
      resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
    }))

    const ciAccessKey = new iam.CfnAccessKey(this, 'CiAccessKey', {
      userName: ciUser.userName,
    })

    // ------------------------------------------------------------------ Outputs
    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront URL — your app lives here',
    })

    new cdk.CfnOutput(this, 'BackendIp', {
      value: eip.ref,
      description: 'EC2 Elastic IP → GitHub secret EC2_HOST, and VITE_API_URL base',
    })

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: siteBucket.bucketName,
      description: 'GitHub secret S3_BUCKET',
    })

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
      description: 'GitHub secret CLOUDFRONT_DISTRIBUTION_ID',
    })

    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: db.secret?.secretArn ?? '',
      description: 'Retrieve from Secrets Manager to build DATABASE_URL for the .env on EC2',
    })

    new cdk.CfnOutput(this, 'CiAccessKeyId', {
      value: ciAccessKey.ref,
      description: 'GitHub secret AWS_ACCESS_KEY_ID',
    })

    new cdk.CfnOutput(this, 'CiSecretAccessKey', {
      value: ciAccessKey.attrSecretAccessKey,
      description: 'GitHub secret AWS_SECRET_ACCESS_KEY',
    })
  }
}
