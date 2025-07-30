# AWS Operational Dashboard

![Dashboard Screenshot](https://ibb.co/bjkPkhJJ)

A comprehensive, locally-hosted dashboard built with Python (Flask) and vanilla JavaScript to monitor key metrics from an AWS account. This tool provides at-a-glance insights into costs, resource status, and security posture.

---

## ✨ Features

-   **Cost Analysis:** Visualize daily, monthly, and yearly AWS costs with a dynamic, filterable line chart. Anomalies (sudden cost spikes) are automatically detected and highlighted.
-   **EC2 Instance Monitoring:** View a summary of all EC2 instances, their current state (running/stopped), instance type, and average 24-hour CPU utilization.
-   **S3 Bucket Security:** Get an overview of all S3 buckets, their storage size, and their public access status to quickly identify potential security misconfigurations.
-   **IAM User Health:** Analyze the security health of IAM users by checking MFA status and identifying stale access keys that haven't been used in over 90 days.
-   **Modern UI:** A clean, responsive, dark-themed dashboard built with modern CSS and interactive charts.

---

## 🛠️ Tech Stack

-   **Backend:** Python, Flask, Boto3
-   **Database:** MongoDB (Local)
-   **Frontend:** HTML5, CSS3, Vanilla JavaScript
-   **Charting:** Chart.js
-   **AWS Services Used:** Cost Explorer, EC2, S3, IAM, CloudWatch

---

## 🚀 Getting Started

Follow these instructions to set up and run the project locally.

### Prerequisites

-   Python 3.x
-   An AWS account with programmatic access (Access Key ID and Secret Access Key)
-   MongoDB Community Server installed and running locally

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/chitrank123/aws-operational-dashboard.git](https://github.com/YOUR_USERNAME/aws-operational-dashboard.git)
    cd aws-operational-dashboard
    ```

2.  **Set up a Python virtual environment:**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows, use `venv\Scripts\activate`
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure AWS Credentials:**
    Set up your AWS credentials file at `~/.aws/credentials` with the necessary permissions for Cost Explorer, EC2, S3, IAM, and CloudWatch.

### Running the Application

1.  **Fetch AWS Data:**
    Run the fetcher script to populate your local MongoDB with data from AWS. You only need to do this once a day or when you want to refresh the data.
    ```bash
    python fetch_aws_data.py
    ```

2.  **Start the API Server:**
    In a new terminal, start the Flask server.
    ```bash
    python app.py
    ```

3.  **View the Dashboard:**
    Open the `index.html` file in your web browser. The dashboard will connect to your local server and display the data.