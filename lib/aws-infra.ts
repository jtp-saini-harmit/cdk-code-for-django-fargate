import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export class HSMyArchitectureStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const repository = new ecr.Repository(this, "HSDjangoRepository", {
        repositoryName: "products-django-app",
        removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // VPC
    const vpc = new ec2.Vpc(this, 'HSMyVpc', {
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

    // Security Group for RDS
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'HSDatabaseSecurityGroup', {
      vpc: vpc,
      description: 'Security group for RDS database',
      allowAllOutbound: true,
    });

    // RDS Instance
    const database = new rds.DatabaseInstance(this, 'HSProductManagementDB', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MEDIUM
      ),
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [dbSecurityGroup],
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      databaseName: "products_db",
      credentials: rds.Credentials.fromGeneratedSecret("postgres", {
          secretName: "products-db-credentials",
      }),
    });

    // RDS Proxy
    const proxy = new rds.DatabaseProxy(this, 'HSDjangoDBProxy', {
      proxyTarget: rds.ProxyTarget.fromInstance(database),
      secrets: [database.secret!],
      vpc: vpc,
      securityGroups: [dbSecurityGroup],
      debugLogging: true,
      requireTLS: true,
      iamAuth: false,
    });

    const proxyPolicy = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
            "rds-db:connect",
            "rds:*",
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret",
        ],
        resources: [
            `arn:aws:rds-db:${this.region}:${this.account}:dbuser:*/*`,
            `arn:aws:rds:${this.region}:${this.account}:db:${database.instanceIdentifier}`,
            `arn:aws:rds:${this.region}:${this.account}:proxy:${proxy.dbProxyName}`,
            database.secret?.secretArn || "*",
        ],
    });

    const ec2SecurityGroup = new ec2.SecurityGroup(this, "HSEC2SecurityGroup", {
        vpc: vpc,
        allowAllOutbound: true,
        description: "Security group for EC2 instance",
    });

    dbSecurityGroup.addIngressRule(
        ec2SecurityGroup,
        ec2.Port.tcp(5432),
        "Allow access from EC2"
    );

    const ec2Role = new iam.Role(this, "HSEC2Role", {
        assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    ec2Role.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    ec2Role.addToPolicy(
        new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "rds-db:connect",
                "rds:*",
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
            ],
            resources: [
                `arn:aws:rds-db:${this.region}:${this.account}:dbuser:*/*`,
                `arn:aws:rds:${this.region}:${this.account}:db:${database.instanceIdentifier}`,
                database.secret?.secretArn || "*",
            ],
        })
    );

    const ec2Instance = new ec2.Instance(this, "HSDatabaseManagementInstance", {
        vpc,
        vpcSubnets: {
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        instanceType: ec2.InstanceType.of(
            ec2.InstanceClass.T3,
            ec2.InstanceSize.MICRO
        ),
        machineImage: new ec2.AmazonLinuxImage({
            generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        }),
        securityGroup: ec2SecurityGroup,
        role: ec2Role,
    });

    const albSecurityGroup = new ec2.SecurityGroup(this, "HSAlbSecurityGroup", {
        vpc,
        allowAllOutbound: true,
        description: "Security group for ALB",
    });

    albSecurityGroup.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(8000),
        "Allow all traffic on port 8000" 
    );

    albSecurityGroup.addEgressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(8000),
        "Allow all traffic on port 8000"
    );

    const alb = new elbv2.ApplicationLoadBalancer(this, "HSDjangoALB", {
        vpc,
        internetFacing: true,
        securityGroup: albSecurityGroup,
    });

    const cluster = new ecs.Cluster(this, "HSDjangoCluster", {
        vpc: vpc,
        clusterName: "products-django-cluster",
    });

    const taskDefinition = new ecs.FargateTaskDefinition(
        this,
        "HSDjangoTaskDefinition",
        {
            memoryLimitMiB: 512,
            cpu: 256,
        }
    );

    const djangoContainer = taskDefinition.addContainer("django", {
        image: ecs.ContainerImage.fromEcrRepository(repository, "latest"),
        memoryLimitMiB: 512,
        portMappings: [{ containerPort: 8000 }],
        logging: new ecs.AwsLogDriver({
            streamPrefix: "django",
        }),
        environment: {
            DJANGO_SETTINGS_MODULE: "product_management.settings",
            PYTHONUNBUFFERED: "1",
            PYTHONPATH: "/app",
            DATABASE_HOST: proxy.endpoint,
            DATABASE_PORT: "5432",
            DATABASE_NAME: "products_db",
            DATABASE_USER: "postgres",
            DJANGO_DEBUG: "False",
            DJANGO_SECURE_SSL_REDIRECT: "False",
            DATABASE_SSLMODE: "require",
            AWS_DEFAULT_REGION: this.region,
            ALLOWED_HOSTS: "*",
            DJANGO_SUPERUSER_CREATE: "true",
        },
        secrets: {
            DJANGO_SECRET_KEY: ecs.Secret.fromSecretsManager(
                new secretsmanager.Secret(this, "HSDjangoSecret", {
                    generateSecretString: {
                        secretStringTemplate: JSON.stringify({ secretKey: "" }),
                        generateStringKey: "secretKey",
                    },
                }),
                "secretKey"
            ),
            DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(
                database.secret!,
                "password"
            ),
        },
    });

    taskDefinition.taskRole.addToPrincipalPolicy(proxyPolicy);

    const serviceSecurityGroup = new ec2.SecurityGroup(
        this,
        "HSServiceSecurityGroup",
        {
            vpc,
            allowAllOutbound: true,
            description: "Security group for Django service",
        }
    );

    const service = new ecs.FargateService(this, "HSDjangoService", {
        cluster,
        taskDefinition,
        desiredCount: 1,
        assignPublicIp: false,
        securityGroups: [serviceSecurityGroup],
    });

    dbSecurityGroup.addIngressRule(
        serviceSecurityGroup,
        ec2.Port.tcp(5432),
        "Allow access from ECS service"
    );

    serviceSecurityGroup.addIngressRule(
        albSecurityGroup,
        ec2.Port.tcp(8000),
        "Allow access from ALB"
    );

    // Allow outbound traffic to RDS
    // serviceSecurityGroup.addEgressRule(
    //     ec2.Peer.anyIpv4(),
    //     ec2.Port.tcp(5432),
    //     "Allow PostgreSQL outbound traffic"
    // );

    // Allow outbound traffic to ALB
    serviceSecurityGroup.addEgressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(8000),
        "Allow HTTP outbound traffic"
    );

    const listener = alb.addListener("HSDjangoListener", {
        port: 8000,
    });

    listener.addTargets("HSDjangoTarget", {
        port: 8000,
        targets: [service],
        healthCheck: {
            path: "/health/",
            interval: cdk.Duration.seconds(60),
            timeout: cdk.Duration.seconds(30),
            healthyThresholdCount: 2,
            unhealthyThresholdCount: 2,
            protocol: elbv2.Protocol.HTTP,
            port: "8000",
        },
    });
  }
}
