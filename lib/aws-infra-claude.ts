import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';

export class MyArchitectureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC with public and private subnets
    const vpc = new ec2.Vpc(this, 'MyVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        }
      ]
    });

    // Security Groups
    const albSg = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for ALB',
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic');
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS traffic');

    const ecsSg = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for ECS',
    });
    ecsSg.addIngressRule(albSg, ec2.Port.tcp(80), 'Allow traffic from ALB');

    const rdsSg = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for RDS',
    });
    rdsSg.addIngressRule(ecsSg, ec2.Port.tcp(5432), 'Allow PostgreSQL traffic from ECS');

    // ALB in the public subnet
    const alb = new elbv2.ApplicationLoadBalancer(this, 'MyAlb', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }
    });

    // WAF Web ACL for ALB
    const webAcl = new wafv2.CfnWebACL(this, 'MyWebAcl', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'MyWebAcl',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'RateLimit',
          priority: 1,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 100,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimit',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, 'WebAclAssociation', {
      resourceArn: alb.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    });

    // PostgreSQL RDS instance
    const database = new rds.DatabaseInstance(this, 'ProductManagementDB', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_13,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MEDIUM
      ),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [rdsSg],
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
    });

    // Database credentials in Secrets Manager
    const dbSecret = new secretsmanager.Secret(this, 'DBCredentials', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'admin',
          dbname: 'product_management'
        }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\',
      },
    });

    // Django secret key
    const djangoSecret = new secretsmanager.Secret(this, 'DjangoSecret', {
      generateSecretString: {
        excludeCharacters: '"@/\\',
      },
    });

    // RDS Proxy
    const rdsProxy = new rds.DatabaseProxy(this, 'DjangoDBProxy', {
      proxyTarget: rds.ProxyTarget.fromInstance(database),
      secrets: [dbSecret],
      vpc,
      securityGroups: [rdsSg],
      debugLogging: true,
      requireTLS: true,
      iamAuth: false,
    });

    // S3 Buckets
    const bucketApp = new s3.Bucket(this, 'AppBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const bucketLogs = new s3.Bucket(this, 'LogsBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'ProductManagementCluster', {
      vpc,
      containerInsights: true,
    });

    // Task Definition
    const taskDef = new ecs.FargateTaskDefinition(this, 'DjangoTaskDef', {
      memoryLimitMiB: 2048,
      cpu: 1024,
    });

    // Add volume for sharing between containers
    const sharedVolume = {
      name: 'static',
      host: {}
    };
    taskDef.addVolume(sharedVolume);

    // Django application container
    const djangoContainer = taskDef.addContainer('DjangoContainer', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-containers/django-demo:latest'),
      memoryLimitMiB: 1024,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'django',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        'DJANGO_SETTINGS_MODULE': 'product_management.settings',
        'DATABASE_HOST': rdsProxy.endpoint,
        'DATABASE_PORT': '5432',
        'ALLOWED_HOSTS': '*',
        'DEBUG': 'False',
        'STATIC_ROOT': '/static',
        'GUNICORN_WORKERS': '4'
      },
      secrets: {
        'DATABASE_NAME': ecs.Secret.fromSecretsManager(dbSecret, 'dbname'),
        'DATABASE_USER': ecs.Secret.fromSecretsManager(dbSecret, 'username'),
        'DATABASE_PASSWORD': ecs.Secret.fromSecretsManager(dbSecret, 'password'),
        'DJANGO_SECRET_KEY': ecs.Secret.fromSecretsManager(djangoSecret),
      },
      portMappings: [
        {
          containerPort: 8000,
          protocol: ecs.Protocol.TCP,
        },
      ],
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8000/health/ || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // Create additional volume for nginx config
    const nginxConfigVolume = {
      name: 'nginx-config',
      host: {}
    };
    taskDef.addVolume(nginxConfigVolume);

    // Nginx container
    const nginxContainer = taskDef.addContainer('NginxContainer', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/nginx/nginx:latest'),
      memoryLimitMiB: 512,
      command: [
        'sh',
        '-c',
        'echo "server { listen 80; location / { proxy_pass http://localhost:8000; proxy_set_header Host \\$host; proxy_set_header X-Real-IP \\$remote_addr; } location /static/ { alias /static/; } }" > /etc/nginx/conf.d/default.conf && nginx -g "daemon off;"'
      ],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'nginx',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      portMappings: [
        {
          containerPort: 80,
          protocol: ecs.Protocol.TCP,
        },
      ],
      healthCheck: {
        command: ['CMD-SHELL', 'nginx -t || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
      },
    });

    // Configure volumes
    djangoContainer.addMountPoints({
      sourceVolume: sharedVolume.name,
      containerPath: '/static',
      readOnly: false,
    });

    nginxContainer.addMountPoints({
      sourceVolume: sharedVolume.name,
      containerPath: '/static',
      readOnly: true,
    });

    // Add container dependency
    nginxContainer.addContainerDependencies({
      container: djangoContainer,
      condition: ecs.ContainerDependencyCondition.START,
    });

    // Create service
    const service = new ecs.FargateService(this, 'DjangoService', {
      cluster,
      taskDefinition: taskDef,
      securityGroups: [ecsSg],
      desiredCount: 2,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

    // ALB Listener
    const listener = alb.addListener('HttpListener', {
      port: 80,
      open: true,
    });

    // Target Group for Nginx
    listener.addTargets('WebTarget', {
      port: 80,
      targets: [service],
      healthCheck: {
        path: '/health/',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // CloudWatch Logs
    const logGroup = new logs.LogGroup(this, 'MyLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // CloudTrail
    const trail = new cloudtrail.Trail(this, 'MyTrail', {
      bucket: bucketLogs,
      sendToCloudWatchLogs: true,
      cloudWatchLogGroup: logGroup,
    });

    // SNS Topic
    const topic = new sns.Topic(this, 'MyTopic');

    // Parameter Store
    const parameter = new ssm.StringParameter(this, 'AppParameter', {
      parameterName: '/app/config/environment',
      stringValue: 'production',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Grant permissions
    bucketApp.grantReadWrite(taskDef.taskRole);

    // CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'ProductManagementDashboard', {
      dashboardName: 'ProductManagementSystem',
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Service CPU Utilization',
        left: [service.metricCpuUtilization()],
      }),
      new cloudwatch.GraphWidget({
        title: 'Service Memory Utilization',
        left: [service.metricMemoryUtilization()],
      }),
      new cloudwatch.GraphWidget({
        title: 'ALB Request Count',
        left: [alb.metricRequestCount()],
      }),
      new cloudwatch.GraphWidget({
        title: 'RDS Connections',
        left: [database.metricDatabaseConnections()],
      }),
    );

    // Output the ALB DNS name
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'The DNS name of the load balancer',
    });
  }
}

const app = new cdk.App();

new MyArchitectureStack(app, 'MyArchitectureStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});

app.synth();
