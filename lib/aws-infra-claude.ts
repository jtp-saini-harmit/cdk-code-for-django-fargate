import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as guardduty from "aws-cdk-lib/aws-guardduty";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudtrail from "aws-cdk-lib/aws-cloudtrail";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as sns from "aws-cdk-lib/aws-sns";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";

export class MyArchitectureStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		// VPC with public and private subnets
		const vpc = new ec2.Vpc(this, "MyVpc", {
			maxAzs: 2,
			natGateways: 1,
			subnetConfiguration: [
				{
					name: "public",
					subnetType: ec2.SubnetType.PUBLIC,
					cidrMask: 24,
				},
				{
					name: "private",
					subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
					cidrMask: 24,
				},
			],
		});

		// データベースのセキュリティグループ
		const dbSecurityGroup = new ec2.SecurityGroup(
			this,
			"DatabaseSecurityGroup",
			{
				vpc,
				allowAllOutbound: true,
				description: "Security group for RDS database",
			}
		);

		// RDSインスタンスの作成
		const database = new rds.DatabaseInstance(this, "Database", {
			engine: rds.DatabaseInstanceEngine.postgres({
				version: rds.PostgresEngineVersion.VER_15,
			}),
			vpc,
			vpcSubnets: {
				subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
			},
			instanceType: ec2.InstanceType.of(
				ec2.InstanceClass.BURSTABLE3,
				ec2.InstanceSize.MEDIUM
			),
			allocatedStorage: 20,
			maxAllocatedStorage: 100,
			securityGroups: [dbSecurityGroup],
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			deletionProtection: false,
			databaseName: "django_db",
			credentials: rds.Credentials.fromGeneratedSecret("postgres", {
				secretName: "django-db-credentials",
			}),
		});

		// RDS Proxyの作成
		const proxy = new rds.DatabaseProxy(this, "DatabaseProxy", {
			proxyTarget: rds.ProxyTarget.fromInstance(database),
			vpc,
			securityGroups: [dbSecurityGroup],
			secrets: [database.secret!],
			iamAuth: false,
			requireTLS: true,
			debugLogging: true,
		});

		// RDS ProxyのIAMロールをECSタスクロールに付与
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

		// ECRリポジトリの作成
		const repository = new ecr.Repository(this, "DjangoRepository", {
			repositoryName: "django-app",
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});

		// ALBのセキュリティグループ
		const albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
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

		// Application Load Balancerの作成
		const alb = new elbv2.ApplicationLoadBalancer(this, "DjangoALB", {
			vpc,
			internetFacing: true,
			securityGroup: albSecurityGroup,
		});

		// ECSクラスターの作成
		const cluster = new ecs.Cluster(this, "DjangoCluster", {
			vpc: vpc,
			clusterName: "django-cluster",
		});

		// Fargateタスク定義の作成
		const taskDefinition = new ecs.FargateTaskDefinition(
			this,
			"DjangoTaskDefinition",
			{
				memoryLimitMiB: 512,
				cpu: 256,
			}
		);

		// Djangoコンテナの定義
		const djangoContainer = taskDefinition.addContainer("django", {
			image: ecs.ContainerImage.fromEcrRepository(repository, "v7"),
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
				DATABASE_NAME: "django_db",
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
					new secretsmanager.Secret(this, "DjangoSecret", {
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

		// タスク実行ロールにRDS Proxyへの接続権限を追加
		taskDefinition.taskRole.addToPrincipalPolicy(proxyPolicy);

		// ECSサービスのセキュリティグループ
		const serviceSecurityGroup = new ec2.SecurityGroup(
			this,
			"ServiceSecurityGroup",
			{
				vpc,
				allowAllOutbound: true,
				description: "Security group for Django service",
			}
		);

		// ECSサービスの作成
		const service = new ecs.FargateService(this, "DjangoService", {
			cluster,
			taskDefinition,
			desiredCount: 1,
			assignPublicIp: false,
			securityGroups: [serviceSecurityGroup],
		});

		// セキュリティグループルールの設定
		dbSecurityGroup.addIngressRule(
			serviceSecurityGroup,
			ec2.Port.tcp(5432),
			"Allow access from ECS service"
		);

		// ECSサービスへのALBからのアクセスを許可
		serviceSecurityGroup.addIngressRule(
			alb.connections.securityGroups[0],
			ec2.Port.tcp(8000),
			"Allow access from ALB"
		);

		serviceSecurityGroup.addEgressRule(
			ec2.Peer.anyIpv4(),
			ec2.Port.tcp(8000),
			"Allow all outbound traffic"
		);

		// ALBリスナーの作成
		const listener = alb.addListener("Listener", {
			port: 8000,
		});

		// ALBターゲットグループの作成とサービスへの関連付け
		listener.addTargets("DjangoTarget", {
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

const app = new cdk.App();

new MyArchitectureStack(app, "MyArchitectureStack", {
	env: {
		account: process.env.CDK_DEFAULT_ACCOUNT,
		region: process.env.CDK_DEFAULT_REGION,
	},
});

app.synth();
