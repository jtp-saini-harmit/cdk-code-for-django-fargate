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
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';

export class MyArchitectureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC with public and private subnets as shown in the diagram
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

    const opensearchSg = new ec2.SecurityGroup(this, 'OpenSearchSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for OpenSearch',
    });
    opensearchSg.addIngressRule(ecsSg, ec2.Port.tcp(443), 'Allow HTTPS traffic from ECS');

    // Application Load Balancer in the public subnet
    const alb = new elbv2.ApplicationLoadBalancer(this, 'MyAlb', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }
    });

    // WAF Web ACL for ALB (shown in the diagram)
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

    // Associate WAF with ALB (requires CfnAssociation)
    new wafv2.CfnWebACLAssociation(this, 'WebAclAssociation', {
      resourceArn: alb.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    });

    // PostgreSQL RDS instance for Django
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

    // Create database credentials in Secrets Manager
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

    // Create Django secret key
    const djangoSecret = new secretsmanager.Secret(this, 'DjangoSecret', {
      generateSecretString: {
        excludeCharacters: '"@/\\',
      },
    });

    // RDS Proxy with Secrets Manager integration (using existing service-linked role)
    const rdsProxy = new rds.DatabaseProxy(this, 'DjangoDBProxy', {
      proxyTarget: rds.ProxyTarget.fromInstance(database),
      secrets: [dbSecret],
      vpc,
      securityGroups: [rdsSg],
      debugLogging: true,
      requireTLS: true,
      iamAuth: false,  // Disable IAM auth for now
    });

    // ECR Repository for Django application
    const repository = new ecr.Repository(this, 'ProductManagementRepo', {
      repositoryName: 'product-management-system',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      imageScanOnPush: true
    });
        // S3 Buckets (multiple S3 buckets in the diagram)
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
        
    const cluster = new ecs.Cluster(this, 'ProductManagementCluster', {
      vpc,
      containerInsights: true,
    });

    // Create Django task definition with Nginx sidecar
    const djangoTaskDef = new ecs.FargateTaskDefinition(this, 'DjangoTaskDef', {
      memoryLimitMiB: 2048,
      cpu: 1024,
    });

    // Add volume for sharing between containers
    const sharedVolume = {
      name: 'static',
      host: {}
    };
    djangoTaskDef.addVolume(sharedVolume);

    // Create Django ECS service
    const djangoService = new ecs.FargateService(this, 'DjangoService', {
      cluster,
      taskDefinition: djangoTaskDef,
      securityGroups: [ecsSg],
      desiredCount: 2,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

        // CodePipeline for CI/CD (connecting CodeCommit to ECS)
        const pipeline = new codepipeline.Pipeline(this, 'MyPipeline', {
          pipelineName: 'AppDeploymentPipeline',
          artifactBucket: bucketApp,
        });
    
        const sourceOutput = new codepipeline.Artifact();
        const buildOutput = new codepipeline.Artifact();
    
        // Source stage - Get code from GitHub
        pipeline.addStage({
          stageName: 'Source',
          actions: [
            new codepipeline_actions.GitHubSourceAction({
              actionName: 'GitHub',
              owner: 'jtp-saini-harmit',
              repo: 'django-product-management-system-with-aws',
              branch: 'main',
              output: sourceOutput,
              oauthToken: cdk.SecretValue.secretsManager('github-token'),
              trigger: codepipeline_actions.GitHubTrigger.WEBHOOK, // Use webhooks for automatic triggers
            }),
          ],
        });
    
    // Build stage - Build Docker image
    const buildProject = new codebuild.PipelineProject(this, 'MyBuildProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true, // Required for Docker builds
        computeType: codebuild.ComputeType.SMALL,
        environmentVariables: {
          'REPOSITORY_URI': { 
            value: repository.repositoryUri,
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
          },
          'AWS_DEFAULT_REGION': { 
            value: this.region,
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
          },
          'AWS_ACCOUNT_ID': { 
            value: this.account,
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT
          },
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '16',
              python: '3.9'
            },
            commands: [
              'n 16',
              'npm install -g aws-cdk',
              'pip install --upgrade pip',
              'pip install --upgrade awscli'
            ]
          },
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              'aws --version',
              'docker --version',
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
              'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
              'IMAGE_TAG=${COMMIT_HASH:=latest}',
              'echo Repository URI: $REPOSITORY_URI',
              'echo Image tag: $IMAGE_TAG',
              'echo Ensuring repository exists...',
              'aws ecr describe-repositories --repository-names $(echo $REPOSITORY_URI | cut -d/ -f2) || aws ecr create-repository --repository-name $(echo $REPOSITORY_URI | cut -d/ -f2)'
            ]
          },
          build: {
            commands: [
              'echo Build started on `date`',
              'echo Building the Docker image...',
              'pwd && ls -la',
              'docker build -t $REPOSITORY_URI:$IMAGE_TAG .',
              'docker tag $REPOSITORY_URI:$IMAGE_TAG $REPOSITORY_URI:latest'
            ]
          },
          post_build: {
            commands: [
              'echo Build completed on `date`',
              'echo Pushing the Docker images...',
              'docker push $REPOSITORY_URI:$IMAGE_TAG',
              'docker push $REPOSITORY_URI:latest',
              'echo Writing image definitions file...',
              'printf \'[{"name":"DjangoContainer","imageUri":"%s"}]\' "$REPOSITORY_URI:$IMAGE_TAG" > imageDefinitions.json',
              'cat imageDefinitions.json'
            ]
          }
        },
        artifacts: {
          files: ['imageDefinitions.json']
        },
        cache: {
          paths: [
            '/root/.m2/**/*',
            '/root/.npm/**/*',
            '/root/.pip/**/*'
          ]
        }
      }),
    });

    // Grant ECR permissions to CodeBuild
    repository.grantPullPush(buildProject);
    
    // Add additional IAM permissions for ECR operations
    buildProject.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:CompleteLayerUpload',
        'ecr:GetAuthorizationToken',
        'ecr:InitiateLayerUpload',
        'ecr:PutImage',
        'ecr:UploadLayerPart',
        'ecr:CreateRepository'
      ],
      resources: ['*'],
    }));

    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'BuildDockerImage',
          project: buildProject,
          input: sourceOutput,
          outputs: [buildOutput],
        }),
      ],
    });
    
        // Deploy stage - Deploy Django to ECS
        pipeline.addStage({
          stageName: 'Deploy',
          actions: [
            new codepipeline_actions.EcsDeployAction({
              actionName: 'DeployDjango',
              service: djangoService,
              imageFile: buildOutput.atPath('imageDefinitions.json'),
            }),
          ],
        });
        

    // ECS Cluster


    // Django application container with secrets
    const djangoContainer = djangoTaskDef.addContainer('DjangoContainer', {
      image: ecs.ContainerImage.fromEcrRepository(repository),
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
      command: [
        "sh", "-c",
        "python manage.py collectstatic --noinput && gunicorn product_management.wsgi:application --bind 0.0.0.0:8000 --workers 4"
      ],
    });

    // Mount static volume for Django
    djangoContainer.addMountPoints({
      sourceVolume: sharedVolume.name,
      containerPath: '/static',
      readOnly: false,
    });

    // Nginx container as reverse proxy
    const nginxContainer = djangoTaskDef.addContainer('NginxContainer', {
      image: ecs.ContainerImage.fromRegistry('nginx:latest'),
      memoryLimitMiB: 512,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'nginx',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      portMappings: [
        {
          containerPort: 80,
          hostPort: 80,
          protocol: ecs.Protocol.TCP,
        },
      ],
      healthCheck: {
        command: ['CMD-SHELL', 'nginx -t || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
      },
      environment: {
        'NGINX_PORT': '80',
        'DJANGO_HOST': 'localhost',
        'DJANGO_PORT': '8000'
      }
    });

    // Mount static volume for Nginx
    nginxContainer.addMountPoints({
      sourceVolume: sharedVolume.name,
      containerPath: '/static',
      readOnly: true,
    });



    // Add containers dependency
    nginxContainer.addContainerDependencies({
      container: djangoContainer,
      condition: ecs.ContainerDependencyCondition.START,
    });

    // ALB Listener
    const listener = alb.addListener('HttpListener', {
      port: 80,
      open: true,
    });

    // Target Group for Django service
    listener.addTargets('DjangoTarget', {
      port: 80,
      targets: [djangoService],
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

    // OpenSearch Domain
    // const openSearchDomain = new opensearch.Domain(this, 'MyOpenSearch', {
    //   version: opensearch.EngineVersion.OPENSEARCH_1_0,
    //   vpc,
    //   vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    //   securityGroups: [opensearchSg],
    //   capacity: {
    //     masterNodes: 2,
    //     dataNodes: 2,
    //     dataNodeInstanceType: 't3.small.search',
    //   },
    //   ebs: {
    //     volumeSize: 10,
    //   },
    //   nodeToNodeEncryption: true,
    //   encryptionAtRest: {
    //     enabled: true,
    //   },
    // });



    // SQS Queue
    const queue = new sqs.Queue(this, 'MyQueue', {
      visibilityTimeout: cdk.Duration.seconds(300),
      retentionPeriod: cdk.Duration.days(4),
    });

    // Lambda Functions (multiple Lambda functions in diagram)
    const lambdaFunction1 = new lambda.Function(this, 'Lambda1', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Processing queue events');
          return { statusCode: 200, body: JSON.stringify('Messages processed!') };
        };
      `),
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
    });

    const lambdaFunction2 = new lambda.Function(this, 'Lambda2', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Processing API requests');
          return { statusCode: 200, body: JSON.stringify('Hello from API Lambda!') };
        };
      `),
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
    });

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, 'MyDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(bucketApp),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.LoadBalancerV2Origin(alb),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        }
      }
    });

    // ACM Certificate for SSL (shown in diagram)
    // const certificate = new acm.Certificate(this, 'MyCertificate', {
    //   domainName: 'example.com',
    //   validation: acm.CertificateValidation.fromDns(),
    // });

    // GuardDuty Detector (security monitoring in diagram)
    // const detector = new guardduty.CfnDetector(this, 'MyGuardDutyDetector', {
    //   enable: true,
    // });

    // CloudWatch Logs for centralized logging
    const logGroup = new logs.LogGroup(this, 'MyLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // CloudTrail for auditing
    const trail = new cloudtrail.Trail(this, 'MyTrail', {
      bucket: bucketLogs,
      sendToCloudWatchLogs: true,
      cloudWatchLogGroup: logGroup,
    });

    // EventBridge (CloudWatch Events in diagram)
    // const rule = new events.Rule(this, 'GuardDutyFindingsRule', {
    //   eventPattern: {
    //     source: ['aws.guardduty'],
    //     detailType: ['GuardDuty Finding'],
    //   },
    // });

    // Send GuardDuty findings to Lambda
    // rule.addTarget(new targets.LambdaFunction(lambdaFunction1));

    // SNS Topic for notifications (shown in diagram)
    const topic = new sns.Topic(this, 'MyTopic');

    // Subscribe Lambda to SQS
    // lambdaFunction1.addEventSource(new lambda.SqsEventSource(queue));

    // Systems Manager (SSM) for parameter store and management
    const parameter = new ssm.StringParameter(this, 'AppParameter', {
      parameterName: '/app/config/environment',
      stringValue: 'production',
      tier: ssm.ParameterTier.STANDARD,
    });

    // Grant ECS tasks access to S3 bucket
    bucketApp.grantReadWrite(djangoTaskDef.taskRole);

    // Setup CloudWatch monitoring dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'ProductManagementDashboard', {
      dashboardName: 'ProductManagementSystem',
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Django Service CPU Utilization',
        left: [djangoService.metricCpuUtilization()],
      }),
      new cloudwatch.GraphWidget({
        title: 'Django Service Memory Utilization',
        left: [djangoService.metricMemoryUtilization()],
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
  }
}

// App definition with regions
const app = new cdk.App();

// Tokyo region stack
new MyArchitectureStack(app, 'MyArchitectureStack', {
    env: { 
        account: process.env.CDK_DEFAULT_ACCOUNT, 
        region: process.env.CDK_DEFAULT_REGION 
      },
});
app.synth();
