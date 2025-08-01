from flask import Flask, jsonify
from pymongo import MongoClient
from flask_cors import CORS
from bson import ObjectId # Import ObjectId to check its type
from flask import request
import boto3
# --- Configuration ---
MONGO_URI = "mongodb://localhost:27017/"
DB_NAME = 'AWSCostData'

# Initialize App
app = Flask(__name__)
CORS(app)
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
ec2_client = boto3.client('ec2') # <-- 2. INITIALIZE THE EC2 CLIENT


# --- Helper Function to Fix the Error ---
def serialize_doc(doc):
    """Converts a MongoDB document to a JSON-serializable format."""
    if '_id' in doc and isinstance(doc['_id'], ObjectId):
        doc['_id'] = str(doc['_id'])
    return doc


@app.route('/api/cost-data')
def get_cost_data():
    granularity = request.args.get('granularity', 'DAILY').upper()
    
    items = []
    if granularity == 'DAILY':
        collection = db['dailycosts']
        cursor = collection.find({}).sort('Date', 1).limit(30)
        items = [serialize_doc(item) for item in cursor]

    elif granularity == 'MONTHLY':
        collection = db['monthlycosts']
        cursor = collection.find({}).sort('Date', 1)
        items = [serialize_doc(item) for item in cursor]

    elif granularity == 'YEARLY':
        # Calculate yearly totals from monthly data
        collection = db['monthlycosts']
        pipeline = [
            {
                "$group": {
                    "_id": {"$substr": ["$Date", 0, 4]}, # Group by year
                    "TotalCost": {"$sum": "$Cost"}
                }
            },
            {"$sort": {"_id": 1}}
        ]
        yearly_data = list(collection.aggregate(pipeline))
        # Format for the chart
        items = [{'Date': item['_id'], 'Cost': item['TotalCost']} for item in yearly_data]

    else:
        return jsonify({"error": "Invalid granularity"}), 400

    return jsonify({
        'labels': [item.get('Date') for item in items],
        'datasets': [{
            'label': f'{granularity.capitalize()} AWS Cost ($)',
            'data': [item.get('Cost') for item in items],
            'borderColor': '#0ea5e9',
            'backgroundColor': 'rgba(14, 165, 233, 0.1)',
            'fill': True,
            'tension': 0.3
        }],
        # Anomaly data is only relevant for the daily view
        'anomalies': [item.get('IsAnomaly', False) for item in items] if granularity == 'DAILY' else []
    })

@app.route('/api/ec2-summary')
def get_ec2_summary():
    collection = db['ec2_instances']
    instances = [serialize_doc(doc) for doc in collection.find({})] # Use the helper
    print(f"Found {len(instances)} EC2 documents.")
    running_count = collection.count_documents({'State': 'running'})
    stopped_count = collection.count_documents({'State': 'stopped'})
    return jsonify({
        'total': len(instances),
        'running': running_count,
        'stopped': stopped_count,
        'instances': instances
    })

@app.route('/api/s3-summary')
def get_s3_summary():
    collection = db['s3_buckets']
    buckets = [serialize_doc(doc) for doc in collection.find({})] # Use the helper
    print(f"Found {len(buckets)} S3 documents.")
    public_count = collection.count_documents({'IsPublic': True})
    return jsonify({
        'total': len(buckets),
        'public': public_count,
        'private': len(buckets) - public_count,
        'buckets': buckets
    })

@app.route('/api/iam-summary')
def get_iam_summary():
    collection = db['iam_users']
    users = [serialize_doc(doc) for doc in collection.find({})] # Use the helper
    print(f"Found {len(users)} IAM documents.")
    mfa_enabled_count = collection.count_documents({'MfaEnabled': True})
    return jsonify({
        'total': len(users),
        'mfa_enabled': mfa_enabled_count,
        'no_mfa': len(users) - mfa_enabled_count,
        'users': users
    })
# --- NEW ACTION ROUTE ---
@app.route('/api/ec2-action', methods=['POST'])
def ec2_action():
    data = request.get_json()
    action = data.get('action')
    instance_id = data.get('instance_id')

    if not action or not instance_id:
        return jsonify({"error": "Missing action or instance_id"}), 400

    try:
        if action == 'start':
            print(f"Starting instance: {instance_id}")
            ec2_client.start_instances(InstanceIds=[instance_id])
            message = f"Successfully initiated start for {instance_id}"
        elif action == 'stop':
            print(f"Stopping instance: {instance_id}")
            ec2_client.stop_instances(InstanceIds=[instance_id])
            message = f"Successfully initiated stop for {instance_id}"
        else:
            return jsonify({"error": "Invalid action"}), 400
        
        return jsonify({"success": True, "message": message})

    except Exception as e:
        print(f"Error performing action {action} on {instance_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)