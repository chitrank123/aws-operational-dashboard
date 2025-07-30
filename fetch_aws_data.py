import boto3
from pymongo import MongoClient
from datetime import datetime, timedelta

# --- Configuration ---
MONGO_URI = "mongodb://localhost:27017/"
DB_NAME = 'AWSCostData'

# --- Initialize Clients ---
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
ce_client = boto3.client('ce')
ec2_client = boto3.client('ec2')
s3_client = boto3.client('s3')
iam_client = boto3.client('iam')
cloudwatch_client = boto3.client('cloudwatch')

def fetch_cost_data(granularity='DAILY', collection_name='dailycosts'):
    """Generic function to fetch cost data for a given granularity."""
    print(f"Fetching {granularity} cost data...")
    collection = db[collection_name]
    
    end_date = datetime.now()
    if granularity == 'DAILY':
        start_date = end_date - timedelta(days=30)
    elif granularity == 'MONTHLY':
        start_date = end_date - timedelta(days=365)
    else: # YEARLY
        start_date = end_date - timedelta(days=3*365)

    response = ce_client.get_cost_and_usage(
        TimePeriod={'Start': start_date.strftime('%Y-%m-%d'), 'End': end_date.strftime('%Y-%m-%d')},
        Granularity=granularity,
        Metrics=['UnblendedCost']
    )
    
    # Anomaly detection only for daily data
    daily_costs_amounts = [float(day['Total']['UnblendedCost']['Amount']) for day in response['ResultsByTime']] if granularity == 'DAILY' else []
    average_cost = sum(daily_costs_amounts[:-1]) / len(daily_costs_amounts[:-1]) if len(daily_costs_amounts) > 1 else 0

    for day in response['ResultsByTime']:
        cost_date = day['TimePeriod']['Start']
        cost = float(day['Total']['UnblendedCost']['Amount'])
        
        update_doc = {'Cost': cost}
        if granularity == 'DAILY':
            is_anomaly = (average_cost > 0) and ((cost - average_cost) / average_cost * 100) > 50
            update_doc['IsAnomaly'] = is_anomaly

        collection.update_one({'Date': cost_date}, {'$set': update_doc}, upsert=True)
    print(f"{granularity} cost data fetch complete.")

# Replace the existing function with this one:
def fetch_ec2_data():
    """Fetches EC2 data, including average CPU utilization for running instances."""
    print("Fetching EC2 instance data...")
    collection = db['ec2_instances']
    collection.delete_many({})
    
    response = ec2_client.describe_instances(Filters=[{'Name': 'instance-state-name', 'Values': ['running', 'stopped']}])
    instances_to_insert = []
    for reservation in response['Reservations']:
        for instance in reservation['Instances']:
            instance_name = next((tag['Value'] for tag in instance.get('Tags', []) if tag['Key'] == 'Name'), 'N/A')
            cpu_utilization = 0
            
            # Get CPU Utilization only for running instances
            if instance['State']['Name'] == 'running':
                try:
                    cw_response = cloudwatch_client.get_metric_statistics(
                        Namespace='AWS/EC2',
                        MetricName='CPUUtilization',
                        Dimensions=[{'Name': 'InstanceId', 'Value': instance['InstanceId']}],
                        StartTime=datetime.now() - timedelta(days=1),
                        EndTime=datetime.now(),
                        Period=86400, # 24 hours in seconds
                        Statistics=['Average']
                    )
                    if cw_response['Datapoints']:
                        cpu_utilization = round(cw_response['Datapoints'][0]['Average'], 2)
                except Exception as e:
                    print(f"Could not get CPU for instance {instance['InstanceId']}: {e}")

            instances_to_insert.append({
                'InstanceId': instance['InstanceId'],
                'Name': instance_name,
                'InstanceType': instance['InstanceType'],
                'State': instance['State']['Name'],
                'CPU_Avg_24h': cpu_utilization
            })

    if instances_to_insert:
        collection.insert_many(instances_to_insert)
    print("EC2 data fetch complete.")

def fetch_s3_data():
    """Fetches S3 bucket names, public status, and size."""
    print("Fetching S3 bucket data...")
    collection = db['s3_buckets']
    collection.delete_many({})
    
    response = s3_client.list_buckets()
    buckets_to_insert = []
    for bucket in response['Buckets']:
        # ... (public access check logic remains the same) ...
        is_public = True
        try:
            s3_client.get_public_access_block(Bucket=bucket['Name'])
            is_public = False
        except s3_client.exceptions.ClientError:
            is_public = True
        
        # Get Bucket Size from CloudWatch
        bucket_size_bytes = 0
        try:
            cw_response = cloudwatch_client.get_metric_statistics(
                Namespace='AWS/S3',
                MetricName='BucketSizeBytes',
                Dimensions=[
                    {'Name': 'BucketName', 'Value': bucket['Name']},
                    {'Name': 'StorageType', 'Value': 'StandardStorage'}
                ],
                StartTime=datetime.now() - timedelta(days=2),
                EndTime=datetime.now(),
                Period=86400,
                Statistics=['Average']
            )
            if cw_response['Datapoints']:
                bucket_size_bytes = cw_response['Datapoints'][0]['Average']
        except Exception as e:
            # This can happen if a bucket has no metrics, which is common
            pass

        buckets_to_insert.append({
            'Name': bucket['Name'], 
            'IsPublic': is_public,
            'SizeBytes': bucket_size_bytes
        })

    if buckets_to_insert:
        collection.insert_many(buckets_to_insert)
    print("S3 data fetch complete.")

def fetch_iam_data():
    """Fetches IAM user data, including MFA status and access key status."""
    print("Fetching IAM user data...")
    collection = db['iam_users']
    collection.delete_many({})

    response = iam_client.list_users()
    users_to_insert = []
    for user in response['Users']:
        username = user['UserName']
        
        # Check MFA
        mfa_response = iam_client.list_mfa_devices(UserName=username)
        mfa_enabled = len(mfa_response['MFADevices']) > 0
        
        # Check Access Key Status
        key_status = 'No Keys'
        keys_response = iam_client.list_access_keys(UserName=username)
        if keys_response['AccessKeyMetadata']:
            # Get the most recently used key
            last_used_key = max(keys_response['AccessKeyMetadata'], 
                                key=lambda k: k.get('LastUsedDate', datetime(1900, 1, 1, tzinfo=datetime.now().astimezone().tzinfo)))
            
            if 'LastUsedDate' in last_used_key:
                days_since_use = (datetime.now(last_used_key['LastUsedDate'].tzinfo) - last_used_key['LastUsedDate']).days
                if days_since_use > 90:
                    key_status = f'Stale ({days_since_use} days)'
                else:
                    key_status = 'Used Recently'
            else:
                key_status = 'Never Used'
        
        users_to_insert.append({
            'UserName': username, 
            'MfaEnabled': mfa_enabled,
            'KeyStatus': key_status
        })
    
    if users_to_insert:
        collection.insert_many(users_to_insert)
    print("IAM data fetch complete.")


if __name__ == '__main__':
    # Fetch all necessary cost data
    fetch_cost_data('DAILY', 'dailycosts')
    fetch_cost_data('MONTHLY', 'monthlycosts')
    
    # Fetch other operational data
    fetch_ec2_data()
    fetch_s3_data()
    fetch_iam_data()
    print("\nAll data fetches are complete.")